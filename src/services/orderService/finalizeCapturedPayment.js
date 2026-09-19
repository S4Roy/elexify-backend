import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import Coupon from "../../models/Coupon.js";
import CouponUsage from "../../models/CouponUsage.js";
import User from "../../models/User.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { getRazorpayConfig } from "../integrationCredentials/razorpay.js";
import { sendOrderNotification } from "../notification/sendOrderNotification.js";

import { validateManualPayment } from "./validateManualPayment.js";

const normalize = (value) => String(value || "").toUpperCase();

// A captured payment finalizes to PAID for a normal prepaid order, or to
// ADVANCE_PAID for a Partial COD order (the balance is still Cash on
// Delivery) — both are terminal "online leg cleared" states for the
// purposes of idempotency/replay short-circuiting below.
const isPaymentClearedStatus = (status) =>
  status === PAYMENT_STATUS.PAID || status === PAYMENT_STATUS.ADVANCE_PAID;

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
        if (!finalized?.stock_reserved || !isPaymentClearedStatus(finalized.payment_status)) {
          throw StatusError.conflict("Payment finalization is already in progress");
        }
        return;
      }

      if (manualPayment) validateManualPayment(order, manualPayment);
      if (!manualPayment && order.payment_meta?.payment_provider === "manual") {
        throw StatusError.conflict("Manual payment already recorded");
      }
      const items = await OrderItem.find({ order_id: order._id }).session(session);
      if (!items.length) throw StatusError.conflict("Order has no purchasable items");

      for (const item of items) {
        const Model = item.variation_id ? ProductVariation : Product;
        const stockId = item.variation_id || item.product_id;
        const updated = await Model.updateOne(
          { _id: stockId, status: { $ne: "inactive" }, stock_quantity: { $gte: item.quantity } },
          { $inc: { stock_quantity: -item.quantity } },
          { session },
        );
        if ((updated.modifiedCount ?? updated.nModified) !== 1) {
          throw StatusError.conflict("OUT_OF_STOCK");
        }

        await StockTransaction.create([{
          product: item.product_id,
          variation: item.variation_id || null,
          type: "sale",
          quantity: item.quantity,
          reference_id: order._id,
          reference_type: "order",
          mrp: item.regular_price || 0,
          selling_price: item.unit_price || 0,
        }], { session });
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
          payment_status: order.is_partial_cod ? PAYMENT_STATUS.ADVANCE_PAID : PAYMENT_STATUS.PAID,
          order_status: ORDER_STATUS.PROCESSING,
          paid_at: manualPayment ? new Date(manualPayment.received_at) : new Date(),
          updated_at: new Date(),
          stock_reserved: true,
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
        } },
        { new: true, session },
      );
    });
  } finally {
    await session.endSession();
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
