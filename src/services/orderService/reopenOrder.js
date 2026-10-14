import mongoose from "mongoose";
import Order from "../../models/Order.js";
import { ORDER_STOCK_STATE } from "../../constants/stock.js";
import { commitOrder } from "../stock/mutations.js";
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
      // Only re-sell stock that was actually given back — historical orders
      // that never decremented stock, or an unpaid order whose reservation
      // was merely released, have nothing to reverse. A fresh stock epoch
      // keeps this cycle's ledger keys distinct from the previous sale.
      const restocked = order.stock_state === ORDER_STOCK_STATE.RESTOCKED
        || (order.stock_state === ORDER_STOCK_STATE.NONE && order.stock_reserved && order.inventory_reverted);
      if (restocked) {
        const bumped = await Order.findOneAndUpdate(
          { _id: order._id },
          { $inc: { stock_epoch: 1 } },
          { new: true, session }
        );
        try {
          await commitOrder({ order: bumped, actor: { type: "admin", id: actorId }, session });
        } catch (err) {
          if (err?.message !== "OUT_OF_STOCK") throw err;
          throw StatusError.conflict(
            "Not enough stock left to reopen this order — one of its items no longer has enough units available."
          );
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
