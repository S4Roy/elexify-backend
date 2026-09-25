import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import { StatusError } from "../../config/index.js";
import { ORDER_STATUS } from "../../constants/orderStatus.js";

// Refund states that mean money has already moved (or is mid-flight and
// could complete any moment — see attemptRefund.js's "processing" claim).
// Reopening past either would ship an item that was already paid back,
// without re-collecting payment from the customer, so it's refused outright.
const REFUND_BLOCKS_REOPEN = ["processing", "processed"];

// Admin-only undo of a cancellation, back to "confirmed" — the reinstated
// order re-enters fulfilment from the start of the queue. Mirrors
// cancelOrder.js's inventory bookkeeping in reverse: re-decrements stock
// (mongoose "sale" transactions, same as order placement — see
// finalizeCapturedPayment.js) inside a transaction so a stock shortfall on
// one item never leaves another item's stock silently decremented.
export const reopenOrder = async ({ orderId, actorId, reason }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw StatusError.notFound("Order not found");
  }

  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  if (order.order_status !== ORDER_STATUS.CANCELLED) {
    throw StatusError.badRequest("Only a cancelled order can be reopened.");
  }
  if (REFUND_BLOCKS_REOPEN.includes(order.refund?.status)) {
    throw StatusError.badRequest(
      "This order was already refunded (or a refund is in progress) — reopening it would ship an item that was already paid back. Place a new order instead."
    );
  }

  const session = await mongoose.startSession();
  let reopened;
  try {
    await session.withTransaction(async () => {
      // Only re-reserve stock that was actually given back — historical
      // orders that never reserved stock (stock_reserved: false) or a
      // cancellation that never restored it have nothing to reverse.
      if (order.stock_reserved && order.inventory_reverted) {
        const items = await OrderItem.find({ order_id: order._id }).session(session);
        for (const item of items) {
          const Model = item.variation_id ? ProductVariation : Product;
          const stockId = item.variation_id || item.product_id;
          const updated = await Model.updateOne(
            { _id: stockId, stock_quantity: { $gte: item.quantity } },
            { $inc: { stock_quantity: -item.quantity } },
            { session }
          );
          if ((updated.modifiedCount ?? updated.nModified) !== 1) {
            throw StatusError.conflict(
              `Not enough stock left to reopen this order — one of its items no longer has ${item.quantity} unit(s) available.`
            );
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
      }

      const updated = await Order.findOneAndUpdate(
        { _id: order._id, order_status: ORDER_STATUS.CANCELLED },
        {
          $set: {
            order_status: ORDER_STATUS.CONFIRMED,
            inventory_reverted: false,
            confirmed_at: order.confirmed_at || order.processing_at || new Date(),
          },
          $push: {
            manual_status_history: {
              from: ORDER_STATUS.CANCELLED,
              to: ORDER_STATUS.CONFIRMED,
              reason,
              changed_by: actorId,
              changed_at: new Date(),
            },
          },
        },
        { new: true, session }
      );
      if (!updated) throw StatusError.conflict("Order status changed. Refresh and try again.");
      reopened = updated;
    });
  } finally {
    await session.endSession();
  }

  return reopened;
};
