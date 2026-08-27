import mongoose from "mongoose";
import Order from "../../models/Order.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { attemptRefund } from "./attemptRefund.js";

// Admin-only: retries refund initiation for a cancelled order whose refund
// previously failed. Reuses attemptRefund's own claim/idempotency-key logic,
// so clicking this twice is safe.
export const retryRefund = async ({ orderId }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw StatusError.notFound("Order not found");
  }

  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) {
    throw StatusError.notFound("Order not found");
  }

  if (order.order_status !== ORDER_STATUS.CANCELLED) {
    throw StatusError.badRequest("Only a cancelled order's refund can be retried.");
  }

  if (order.refund?.status === "processed" || order.payment_status === PAYMENT_STATUS.REFUNDED) {
    return order;
  }

  if (order.payment_status !== PAYMENT_STATUS.REFUND_FAILED) {
    throw StatusError.badRequest("This order's refund is not in a failed state.");
  }

  return attemptRefund(order);
};
