import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import Package from "../../../../models/Package.js";
import { StatusError } from "../../../../config/index.js";
import { MANUAL_ORDER_STATUSES } from "./updateStatus.js";

// Hard cap on a single bulk request so one call can't take down the event
// loop or blow past a request timeout. Admins doing more than this should
// filter and run it in batches.
export const BULK_ORDER_STATUS_LIMIT = 100;

const STATUS_RANK = {
  pending: 0, confirmed: 1, processing: 2, packed: 3, shipped: 4,
  out_for_delivery: 5, delivered: 6,
};

// Same eligibility rules as the single-order updateStatus, applied per
// order. Each order is evaluated independently and a bad/ineligible order
// is reported in the results array rather than failing the whole batch —
// bulk admin actions are expected to partially succeed (see e.g. bulk
// ticket/PR actions in other admin tools).
export const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { order_ids, status, reason } = req.body;
    if (!MANUAL_ORDER_STATUSES.includes(status)) {
      throw StatusError.badRequest("Use the dedicated cancellation or return workflow for this status");
    }

    const uniqueIds = [...new Set(order_ids)];
    const changedAt = new Date();
    const targetRank = STATUS_RANK[status] ?? -1;
    const results = [];

    for (const order_id of uniqueIds) {
      if (!mongoose.Types.ObjectId.isValid(order_id)) {
        results.push({ order_id, success: false, error: "Invalid order ID" });
        continue;
      }

      const order = await Order.findOne({ _id: order_id, deleted_at: null });
      if (!order) {
        results.push({ order_id, success: false, error: "Order not found" });
        continue;
      }
      if (order.order_status === status) {
        results.push({ order_id, success: false, error: "Already in this status" });
        continue;
      }
      if (["cancelled", "return_requested", "returned"].includes(order.order_status) ||
          order.inventory_reverted || (order.refund?.status && order.refund.status !== "not_required")) {
        results.push({ order_id, success: false, error: "Order has cancellation, return, or refund effects and cannot be changed manually" });
        continue;
      }
      if (order.package_count > 0 || order.awb || order.shiprocket_order_id ||
          await Package.exists({ order_id: order._id, status: { $ne: "cancelled" } })) {
        results.push({ order_id, success: false, error: "Order has packages or tracking. Update its shipment status through the package workflow" });
        continue;
      }
      if ((order.payment_method === "razorpay" || order.is_partial_cod) && !["paid", "advance_paid"].includes(order.payment_status) &&
          !["pending", "failed"].includes(status)) {
        results.push({ order_id, success: false, error: "Record the received payment from the Payment section before advancing fulfillment" });
        continue;
      }

      const fromStatus = order.order_status;
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, order_status: fromStatus, deleted_at: null, package_count: { $in: [0, null] } },
        {
          $set: {
            order_status: status,
            updated_at: changedAt,
            processing_at: targetRank >= 2 ? (order.processing_at || changedAt) : null,
            shipped_at: targetRank >= 4 ? (order.shipped_at || changedAt) : null,
            delivered_at: targetRank >= 6 ? (order.delivered_at || changedAt) : null,
          },
          $push: { manual_status_history: {
            from: fromStatus, to: status, reason: reason.trim(),
            changed_by: req.auth.user_id, changed_at: changedAt,
          } },
        },
        { new: true },
      );

      if (!updated) {
        results.push({ order_id, success: false, error: "Order status changed concurrently. Refresh and try again" });
        continue;
      }
      results.push({ order_id, success: true, order_status: updated.order_status });
    }

    const summary = {
      total: results.length,
      updated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };

    return res.status(200).json({ status: "success", data: { summary, results } });
  } catch (error) {
    next(error);
  }
};
