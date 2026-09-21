import Order from "../../models/Order.js";
import { StatusError } from "../../config/index.js";
import { canTransitionOrder } from "../../constants/orderStatus.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";

const PAYMENT_TRANSITIONS = {
  pending: ["paid", "advance_paid", "failed"],
  failed: ["paid"],
  // advance_paid: Partial COD order whose online advance cleared. Moves to
  // "paid" once the COD balance is collected on delivery, or refunds like
  // any other cleared payment if the order is cancelled first.
  advance_paid: ["paid", "refund_pending", "refunded", "refund_failed"],
  paid: ["refund_pending", "partially_refunded", "refunded", "refund_failed"],
  refund_pending: ["refunded", "partially_refunded", "refund_failed"],
  refund_failed: ["refund_pending", "refunded"],
  partially_refunded: ["refunded", "refund_pending"],
};

export const canTransitionPayment = (from, to) =>
  !to || from === to || Boolean(PAYMENT_TRANSITIONS[from]?.includes(to));

export const transitionOrder = async ({
  orderId,
  orderStatus,
  paymentStatus,
  set = {},
  session = null,
  source = "application",
  expectedState = null,
}) => {
  const query = Order.findById(orderId);
  if (session) query.session(session);
  const current = await query;
  if (!current) throw StatusError.notFound("Order not found");
  if (expectedState && (current.order_status !== expectedState.order_status || current.payment_status !== expectedState.payment_status
    || ('shiprocket_status_updated_at' in expectedState && Number(new Date(current.shiprocket_status_updated_at || 0)) !== Number(new Date(expectedState.shiprocket_status_updated_at || 0)))
    || ('package_count' in expectedState && (current.package_count || 0) !== expectedState.package_count))) {
    const error = StatusError.conflict("Order changed during shipment reconciliation");
    error.shipmentConflict = true;
    throw error;
  }
  if (orderStatus && !canTransitionOrder(current.order_status, orderStatus)) {
    await recordOperationalEvent({
      eventType: source === "carrier" ? "carrier_transition_rejected" : "illegal_order_transition",
      correlationId: current.id,
      summary: `Rejected order transition ${current.order_status} -> ${orderStatus}`,
      metadata: { from: current.order_status, to: orderStatus, source },
    }).catch(() => undefined);
    throw StatusError.conflict(`Invalid order transition: ${current.order_status} -> ${orderStatus}`);
  }
  if (paymentStatus && !canTransitionPayment(current.payment_status, paymentStatus)) {
    await recordOperationalEvent({
      eventType: "illegal_payment_transition", correlationId: current.id,
      summary: `Rejected payment transition ${current.payment_status} -> ${paymentStatus}`,
      metadata: { from: current.payment_status, to: paymentStatus, source },
    }).catch(() => undefined);
    throw StatusError.conflict(`Invalid payment transition: ${current.payment_status} -> ${paymentStatus}`);
  }
  const update = { ...set };
  if (orderStatus) update.order_status = orderStatus;
  if (paymentStatus) update.payment_status = paymentStatus;
  if (orderStatus === "packed") update["zoho.packed_at"] = current.zoho?.packed_at || new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: current._id, order_status: current.order_status, payment_status: current.payment_status,
      ...(expectedState && 'shiprocket_status_updated_at' in expectedState ? { shiprocket_status_updated_at: current.shiprocket_status_updated_at || null } : {}),
      ...(expectedState && 'package_count' in expectedState ? { package_count: current.package_count ?? null } : {}),
    },
    { $set: update, ...(orderStatus === "packed" || current.zoho?.packed_at ? { $inc: { "zoho.version": 1 } } : {}) },
    { new: true, session },
  );
  if (!updated && expectedState) {
    const error = StatusError.conflict("Order changed during shipment reconciliation");
    error.shipmentConflict = true;
    throw error;
  }
  if (updated?.replacement_return_id && !session) {
    const { syncReplacement } = await import('../returnService/replacement.js');
    const request = await syncReplacement(updated);
    if (request) {
      const { sendReturnNotification } = await import('../notification/sendReturnNotification.js');
      await sendReturnNotification({ request, event: request.status === 'completed' ? 'RETURN_COMPLETED' : 'RETURN_UPDATED' });
    }
  }
  return updated;
};
