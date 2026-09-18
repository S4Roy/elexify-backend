import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import Package from "../../../../models/Package.js";
import { StatusError } from "../../../../config/index.js";

// Manual correction is deliberately limited to fulfillment labels. Cancel,
// refund, return, and parcel changes have their own workflows and side effects.
export const MANUAL_ORDER_STATUSES = [
  "pending", "confirmed", "processing", "packed", "shipped",
  "out_for_delivery", "delivered", "failed",
];

export const updateStatus = async (req, res, next) => {
  try {
    const { order_id, expected_status, status, reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(order_id)) throw StatusError.badRequest("Invalid order ID");

    const order = await Order.findOne({ _id: order_id, deleted_at: null });
    if (!order) throw StatusError.notFound("Order not found");
    if (order.order_status !== expected_status) throw StatusError.conflict("Order status changed. Refresh and try again.");
    if (status === expected_status) throw StatusError.badRequest("Choose a different status");
    if (!MANUAL_ORDER_STATUSES.includes(status)) throw StatusError.badRequest("Use the dedicated cancellation or return workflow for this status");
    if (["cancelled", "return_requested", "returned"].includes(order.order_status) ||
        order.inventory_reverted || order.refund?.status && order.refund.status !== "not_required") {
      throw StatusError.conflict("This order has cancellation, return, or refund effects and cannot be changed manually");
    }
    if (order.package_count > 0 || order.awb || order.shiprocket_order_id ||
        await Package.exists({ order_id: order._id, status: { $ne: "cancelled" } })) {
      throw StatusError.conflict("This order has packages or tracking. Update its shipment status through the package workflow");
    }
    if (order.payment_method === "razorpay" && !["paid", "advance_paid"].includes(order.payment_status) &&
        !["pending", "failed"].includes(status)) {
      throw StatusError.conflict("Confirm the online payment before advancing fulfillment");
    }

    const changedAt = new Date();
    const statusRank = { pending: 0, confirmed: 1, processing: 2, packed: 3, shipped: 4, out_for_delivery: 5, delivered: 6 };
    const targetRank = statusRank[status] ?? -1;
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, order_status: expected_status, deleted_at: null, package_count: { $in: [0, null] } },
      {
        $set: {
          order_status: status,
          updated_at: changedAt,
          processing_at: targetRank >= 2 ? (order.processing_at || changedAt) : null,
          shipped_at: targetRank >= 4 ? (order.shipped_at || changedAt) : null,
          delivered_at: targetRank >= 6 ? (order.delivered_at || changedAt) : null,
        },
        $push: { manual_status_history: {
          from: expected_status, to: status, reason: reason.trim(),
          changed_by: req.auth.user_id, changed_at: changedAt,
        } },
      },
      { new: true },
    );
    if (!updated) throw StatusError.conflict("Order status changed. Refresh and try again.");

    return res.status(200).json({ status: "success", data: { order_status: updated.order_status } });
  } catch (error) {
    next(error);
  }
};
