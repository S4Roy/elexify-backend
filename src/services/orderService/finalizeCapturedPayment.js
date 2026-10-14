import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Coupon from "../../models/Coupon.js";
import CouponUsage from "../../models/CouponUsage.js";
import User from "../../models/User.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { getRazorpayConfig } from "../integrationCredentials/razorpay.js";
import { sendOrderNotification } from "../notification/sendOrderNotification.js";
import { ORDER_STOCK_FLAG, ORDER_STOCK_STATE, REFUNDED_CAPTURE_FLAGS } from "../../constants/stock.js";
import { commitOrder, commitReservation, releaseReservation } from "../stock/mutations.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";
import { attemptRefund } from "./attemptRefund.js";

import { validateManualPayment } from "./validateManualPayment.js";

const normalize = (value) => String(value || "").toUpperCase();

// A captured payment finalizes to PAID for a normal prepaid order, or to
// ADVANCE_PAID for a Partial COD order (the balance is still Cash on
// Delivery) — both are terminal "online leg cleared" states for the
// purposes of idempotency/replay short-circuiting below.
const isPaymentClearedStatus = (status) =>
  status === PAYMENT_STATUS.PAID || status === PAYMENT_STATUS.ADVANCE_PAID;

// Raised inside the finalize transaction to abort it when the capture can't
// confirm the order — stock ran out, or the order was already cancelled. The
// caller then records the payment against a cancelled order and refunds it
// (see finalizeRefundedCapture).
class CaptureNotFulfillable extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}

const paymentFields = ({ order, paymentData, source, manualPayment }) => ({
  payment_status: order.is_partial_cod ? PAYMENT_STATUS.ADVANCE_PAID : PAYMENT_STATUS.PAID,
  paid_at: manualPayment ? new Date(manualPayment.received_at) : new Date(),
  updated_at: new Date(),
  ...(manualPayment ? { manual_payment: {
    ...manualPayment, recorded_at: new Date(),
  } } : {}),
  payment_meta: manualPayment ? {
    payment_provider: "manual",
    razorpay_order_id: order.payment_meta?.razorpay_order_id,
    method: manualPayment.method,
    finalized_by: "admin_manual_payment",
  } : {
    payment_provider: "razorpay",
    razorpay_order_id: paymentData.order_id,
    razorpay_payment_id: paymentData.id,
    method: paymentData.method || null,
    card: paymentData.card || null,
    vpa: paymentData.vpa || null,
    bank: paymentData.bank || null,
    wallet: paymentData.wallet || null,
    finalized_by: source,
  },
});

// A payment was captured but the order can't go ahead:
//  - "out_of_stock": the reservation expired while the customer sat on the
//    payment page and someone else bought the last unit;
//  - "cancelled": the order was cancelled before the payment landed.
// Record the money (so the refund claim can see it), keep/make the order
// cancelled, flag it for staff and refund automatically — instead of failing
// the webhook into the dead-letter queue or reviving a cancelled order.
const finalizeRefundedCapture = async ({ orderId, paymentData, source, manualPayment, kind }) => {
  const wasCancelled = kind === "cancelled";
  const session = await mongoose.startSession();
  let cancelled;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        payment_status: { $nin: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.ADVANCE_PAID] },
      }).session(session);
      if (!order) return;
      if (order.stock_state === ORDER_STOCK_STATE.RESERVED) {
        await releaseReservation({ order, reason: `capture_${kind}`, session });
      }
      cancelled = await Order.findOneAndUpdate(
        { _id: order._id },
        { $set: {
          ...paymentFields({ order, paymentData, source, manualPayment }),
          order_status: ORDER_STATUS.CANCELLED,
          ...(wasCancelled ? {
            // Keep the original cancellation (reason, who, when).
            stock_flag: ORDER_STOCK_FLAG.CAPTURE_AFTER_CANCEL,
          } : {
            stock_flag: ORDER_STOCK_FLAG.LATE_CAPTURE_OOS,
            cancellation: {
              reason: "stock_unavailable_after_payment",
              comment: "Payment was captured after the items sold out. Refunded automatically.",
              requested_at: new Date(),
              cancelled_at: new Date(),
              cancelled_by: "admin",
              forced: false,
            },
          }),
        } },
        { new: true, session },
      );
    });
  } finally {
    await session.endSession();
  }
  if (!cancelled) return { order: await Order.findById(orderId), alreadyFinalized: true };

  await recordOperationalEvent({
    eventType: wasCancelled ? "payment_captured_after_cancel" : "payment_captured_out_of_stock",
    correlationId: cancelled.id,
    summary: wasCancelled
      ? "Payment captured for an already-cancelled order — refund attempted"
      : "Payment captured after stock ran out — order cancelled and refund attempted",
    metadata: { order_id: cancelled._id, source },
  }).catch(() => undefined);
  const refunded = await attemptRefund(cancelled);
  // A customer who cancelled was already told; the refund sends its own notice.
  if (!wasCancelled) {
    sendOrderNotification({
      order: refunded,
      event: "ORDER_CANCELLED",
      dedupeKey: `${refunded.id}:ORDER_CANCELLED`,
    });
  }
  return { order: refunded, alreadyFinalized: false, ...(wasCancelled ? { cancelled: true } : { outOfStock: true }) };
};

export const validateCapturedPayment = (order, payment) => {
  // Partial COD orders only collect the advance online — the remaining
  // balance is Cash on Delivery, so the captured amount must match
  // advance_amount, not the full order value.
  const expectedAmount = Math.round(Number(order.is_partial_cod ? order.advance_amount : order.grand_total) * 100);
  if (
    !payment?.id ||
    payment.order_id !== order.payment_meta?.razorpay_order_id ||
    payment.status !== "captured" ||
    Number(payment.amount) !== expectedAmount ||
    normalize(payment.currency) !== normalize(order.currency)
  ) {
    throw StatusError.badRequest("Captured payment does not match this order");
  }
};

export const finalizeCapturedPayment = async ({
  orderId,
  paymentData,
  source,
  userId = null,
  manualPayment = null,
}) => {
  const lookup = {
    deleted_at: null,
    // Partial COD collects its advance through this exact same Razorpay
    // pipeline, so both payment methods can land here.
    payment_method: { $in: ["razorpay", "cod"] },
    $or: [{ id: orderId }, ...(mongoose.Types.ObjectId.isValid(orderId) ? [{ _id: orderId }] : [])],
  };
  if (userId) lookup.user = userId;

  const existing = await Order.findOne(lookup);
  if (!existing) throw StatusError.notFound("Order not found");
  if (manualPayment) {
    validateManualPayment(existing, manualPayment);
  } else {
    if (existing.payment_meta?.payment_provider === "manual") {
      throw StatusError.conflict("A manual payment is already recorded. Reconcile this gateway payment separately.");
    }
    await getRazorpayConfig();
    validateCapturedPayment(existing, paymentData);
  }

  // Already recorded and refunded against a cancelled order: replays are no-ops.
  if (REFUNDED_CAPTURE_FLAGS.includes(existing.stock_flag)) {
    return { order: existing, alreadyFinalized: true };
  }

  if (isPaymentClearedStatus(existing.payment_status) && existing.stock_reserved) {
    sendOrderNotification({
      order: existing,
      event: "ORDER_PLACED",
      dedupeKey: `${existing.id}:ORDER_PLACED`,
    });
    return { order: existing, alreadyFinalized: true };
  }

  const session = await mongoose.startSession();
  let finalized;
  let unfulfillable = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: existing._id,
        payment_status: { $nin: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.ADVANCE_PAID] },
        stock_reserved: { $ne: true },
      }).session(session);

      if (!order) {
        if (manualPayment) throw StatusError.conflict("Order payment changed. Refresh the order.");
        finalized = await Order.findById(existing._id).session(session);
        if (finalized?.payment_meta?.payment_provider === "manual") {
          throw StatusError.conflict("Manual payment already recorded. Reconcile the gateway payment separately.");
        }
        if (REFUNDED_CAPTURE_FLAGS.includes(finalized?.stock_flag)) return;
        if (!finalized?.stock_reserved || !isPaymentClearedStatus(finalized.payment_status)) {
          throw StatusError.conflict("Payment finalization is already in progress");
        }
        return;
      }

      if (manualPayment) validateManualPayment(order, manualPayment);
      if (!manualPayment && order.payment_meta?.payment_provider === "manual") {
        throw StatusError.conflict("Manual payment already recorded");
      }
      // Never revive an order cancelled before its payment landed.
      if (order.order_status === ORDER_STATUS.CANCELLED) {
        if (manualPayment) throw StatusError.conflict("Order is cancelled");
        throw new CaptureNotFulfillable("cancelled");
      }
      const items = await OrderItem.find({ order_id: order._id }).session(session);
      if (!items.length) throw StatusError.conflict("Order has no purchasable items");

      // Commit the hold placed at checkout. Orders whose hold lapsed (or that
      // predate reservations) sell straight from available stock instead.
      const actor = manualPayment ? { type: "admin", id: userId } : { type: "customer", id: order.user };
      try {
        if (order.stock_state === ORDER_STOCK_STATE.RESERVED) {
          await commitReservation({ order, actor, session });
        } else {
          await commitOrder({ order, items, actor, session });
        }
      } catch (err) {
        // An admin recording a manual payment sees the conflict directly.
        if (err?.message === "OUT_OF_STOCK" && !manualPayment) throw new CaptureNotFulfillable("out_of_stock");
        throw err;
      }

      if (order.coupon_code && Number(order.discount) > 0) {
        const [coupon, user] = await Promise.all([
          Coupon.findOne({ code: order.coupon_code }).session(session),
          User.findById(order.user).session(session),
        ]);
        if (coupon && user?.email) {
          const usage = await CouponUsage.updateOne(
            { order: order._id },
            { $setOnInsert: {
              coupon: coupon._id,
              user: order.user,
              email: user.email,
              discount_amount: order.discount,
              currency: order.currency,
            } },
            { upsert: true, session },
          );
          if (usage.upserted?.length || usage.upsertedId) {
            await Coupon.updateOne({ _id: coupon._id }, { $inc: { total_used: 1 } }, { session });
          }
        }
      }

      finalized = await Order.findOneAndUpdate(
        { _id: order._id, payment_status: { $nin: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.ADVANCE_PAID] } },
        { $set: {
          ...paymentFields({ order, paymentData, source, manualPayment }),
          order_status: ORDER_STATUS.CONFIRMED,
          confirmed_at: new Date(),
          stock_reserved: true,
          stock_state: ORDER_STOCK_STATE.COMMITTED,
        } },
        { new: true, session },
      );
    });
  } catch (err) {
    if (!(err instanceof CaptureNotFulfillable)) throw err;
    unfulfillable = err.kind;
  } finally {
    await session.endSession();
  }
  if (unfulfillable) {
    return finalizeRefundedCapture({ orderId: existing._id, paymentData, source, manualPayment, kind: unfulfillable });
  }
  // All payment entry points (browser, webhook, admin and cron) call this
  // service. Enqueue only after the transaction commits; the dedupe key also
  // makes a concurrent callback or retry safe.
  sendOrderNotification({
    order: finalized,
    event: "ORDER_PLACED",
    dedupeKey: `${finalized.id}:ORDER_PLACED`,
  });
  return { order: finalized, alreadyFinalized: false };
};
