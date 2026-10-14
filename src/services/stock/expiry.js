// Reservation lifecycle jobs: freeing holds whose payment never arrived, and
// failing an unpaid order together with its hold.
import axios from "axios";
import Order from "../../models/Order.js";
import StockReservation from "../../models/StockReservation.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { ORDER_STOCK_STATE, RESERVATION_STATUS } from "../../constants/stock.js";
import { getRazorpayConfig } from "../integrationCredentials/razorpay.js";
import { finalizeCapturedPayment } from "../orderService/finalizeCapturedPayment.js";
import { transitionOrder } from "../orderService/transitionOrder.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";
import { releaseReservation, withStockTransaction } from "./mutations.js";

// If the gateway can't be reached, a hold is kept this long past its expiry
// before being released anyway, so an outage can't pin stock forever.
const GATEWAY_GRACE_MS = 60 * 60_000;

export const fetchRazorpayOrderPayments = async (providerOrderId) => {
  const credentials = await getRazorpayConfig();
  const { data } = await axios.get(
    `https://api.razorpay.com/v1/orders/${providerOrderId}/payments`,
    { auth: { username: credentials.key_id, password: credentials.key_secret } },
  );
  return data.items || [];
};

/** Marks an unpaid order failed and frees its reservation atomically. */
export const failUnpaidOrder = async ({ orderId, reason }) => withStockTransaction(async (session) => {
  const order = await transitionOrder({
    orderId, paymentStatus: PAYMENT_STATUS.FAILED, orderStatus: "failed", session,
  });
  if (order) await releaseReservation({ order, reason, session });
  return order;
});

/**
 * Frees reservations past their expiry. Before releasing, asks the gateway
 * once whether the order was actually paid — a capture whose webhook hasn't
 * landed yet is finalized (committing the hold) rather than released.
 * Does not fail the order; updatePendingRazorpayPayments owns that.
 */
export const releaseExpiredReservations = async ({ now = new Date(), fetchPayments = fetchRazorpayOrderPayments } = {}) => {
  const orderIds = await StockReservation.distinct("order", {
    status: RESERVATION_STATUS.ACTIVE,
    expires_at: { $lt: now },
  });
  const summary = { released: 0, finalized: 0, skipped: 0 };

  for (const orderId of orderIds) {
    try {
      const order = await Order.findById(orderId);
      const paid = [PAYMENT_STATUS.PAID, PAYMENT_STATUS.ADVANCE_PAID].includes(order?.payment_status);
      if (paid && order.stock_state === ORDER_STOCK_STATE.RESERVED) {
        // Paid but never committed — finalize will commit the hold.
        summary.skipped += 1;
        continue;
      }

      const providerOrderId = order?.payment_meta?.razorpay_order_id;
      if (order && !paid && providerOrderId) {
        let payments;
        try {
          payments = await fetchPayments(providerOrderId);
        } catch (err) {
          const expiredAt = order.reservation_expires_at || now;
          if (now - expiredAt < GATEWAY_GRACE_MS) {
            summary.skipped += 1;
            continue;
          }
          payments = [];
        }
        const captured = payments.find((p) => p.status === "captured");
        if (captured) {
          await finalizeCapturedPayment({ orderId: order.id, paymentData: captured, source: "reservation_expiry" });
          summary.finalized += 1;
          continue;
        }
      }

      const released = await withStockTransaction((session) =>
        releaseReservation({ order: order || { _id: orderId }, reason: "expired", session }));
      if (released) summary.released += 1;
    } catch (err) {
      console.error(`[Reservation expiry] ${orderId}:`, err?.message || err);
      await recordOperationalEvent({
        eventType: "reservation_release_failed",
        correlationId: String(orderId),
        summary: "Could not release an expired stock reservation",
        metadata: { reason: err?.message },
      }).catch(() => undefined);
    }
  }
  return summary;
};
