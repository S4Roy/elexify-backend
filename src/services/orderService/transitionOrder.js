import Order from "../../models/Order.js";
import { StatusError } from "../../config/index.js";
import { canTransitionOrder } from "../../constants/orderStatus.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";

const PAYMENT_TRANSITIONS = {
  pending: ["paid", "failed"],
  failed: ["paid"],
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
}) => {
  const query = Order.findById(orderId);
  if (session) query.session(session);
  const current = await query;
  if (!current) throw StatusError.notFound("Order not found");
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
  return Order.findOneAndUpdate(
    { _id: current._id, order_status: current.order_status, payment_status: current.payment_status },
    { $set: update },
    { new: true, session },
  );
};
