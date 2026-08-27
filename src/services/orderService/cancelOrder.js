import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import { StatusError } from "../../config/index.js";
import { CANCELLABLE_ORDER_STATUSES, isOrderCancellable, ORDER_STATUS } from "../../constants/orderStatus.js";
import { attemptRefund } from "./attemptRefund.js";

// Shared by both the customer-facing and admin-facing cancel endpoints, so
// eligibility rules, inventory restoration, and refund initiation are
// defined exactly once.
export const cancelOrder = async ({ orderId, actorType, actorId, reason, comment }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw StatusError.notFound("Order not found");
  }

  const filter = { _id: orderId, deleted_at: null };
  if (actorType === "customer") {
    filter.user = actorId;
  }

  let order = await Order.findOne(filter);
  if (!order) {
    throw StatusError.notFound("Order not found");
  }

  // Idempotent no-op: a double-click or retried request against an
  // already-cancelled order just returns the current state, no side effects
  // are re-run.
  if (order.order_status === ORDER_STATUS.CANCELLED) {
    return order;
  }

  if (!isOrderCancellable(order)) {
    throw StatusError.badRequest(
      "This order can no longer be cancelled. Once an order has shipped, please use the return process instead."
    );
  }

  // Claim: atomically flip to cancelled only if it's still in an eligible
  // status. If this loses a race to a concurrent cancel request, treat it
  // as an idempotent no-op rather than erroring.
  const cancelled = await Order.findOneAndUpdate(
    { _id: order._id, order_status: { $in: [...CANCELLABLE_ORDER_STATUSES, ORDER_STATUS.PACKED] } },
    {
      $set: {
        order_status: ORDER_STATUS.CANCELLED,
        cancellation: {
          reason,
          comment: comment || null,
          requested_at: new Date(),
          cancelled_at: new Date(),
          cancelled_by: actorType,
        },
      },
    },
    { new: true }
  );

  order = cancelled || (await Order.findById(order._id));

  // ── Inventory restore ─────────────────────────────────────────────────
  // Gated strictly on stock_reserved — never inferred from payment_method/
  // payment_status — since historical orders placed before this flag
  // existed never actually decremented stock, and restoring for them would
  // add phantom inventory.
  if (order.stock_reserved && !order.inventory_reverted) {
    const claimedRevert = await Order.findOneAndUpdate(
      { _id: order._id, inventory_reverted: { $ne: true } },
      { $set: { inventory_reverted: true } },
      { new: true }
    );

    if (claimedRevert) {
      const items = await OrderItem.find({ order_id: order._id });
      for (const item of items) {
        if (item.variation_id) {
          await ProductVariation.updateOne(
            { _id: item.variation_id },
            { $inc: { stock_quantity: item.quantity } }
          );
        } else {
          await Product.updateOne(
            { _id: item.product_id },
            { $inc: { stock_quantity: item.quantity } }
          );
        }
        await StockTransaction.create({
          product: item.product_id,
          variation: item.variation_id || null,
          type: "return",
          quantity: item.quantity,
          reference_id: order._id,
          reference_type: "order",
          mrp: item.regular_price || 0,
          selling_price: item.unit_price || 0,
        });
      }
      order = claimedRevert;
    }
  }

  // ── Refund ─────────────────────────────────────────────────────────────
  // Only for a razorpay order whose payment actually cleared. A refund
  // failure never blocks or reverses the cancellation — the order stays
  // cancelled and stock stays restored regardless.
  if (order.payment_method === "razorpay" && order.payment_status === "paid") {
    order = await attemptRefund(order);
  }

  return order;
};
