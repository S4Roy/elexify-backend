import Order from "../../../../models/Order.js";
import { orderService } from "../../../../services/index.js";

// Hard cap on a single bulk request so one call can't take down the event
// loop or blow past a request timeout. Admins doing more than this should
// filter and run it in batches.
export const BULK_ORDER_STATUS_LIMIT = 100;

// Looked up by the human-readable Order.id (e.g. "ORD-010708") rather than
// the Mongo _id — that's the identifier actually shown in the admin
// Orders table, so it's what an admin can copy/paste into a bulk request.
// Each order is evaluated independently and a bad/ineligible order is
// reported in the results array rather than failing the whole batch —
// bulk admin actions are expected to partially succeed (see e.g. bulk
// ticket/PR actions in other admin tools).
export const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { order_ids, status, reason } = req.body;
    const uniqueIds = [...new Set(order_ids)];
    const changedBy = req.auth.user_id;
    const results = [];

    for (const orderHumanId of uniqueIds) {
      try {
        const order = await Order.findOne({ id: orderHumanId, deleted_at: null });
        const updated = await orderService.applyManualOrderStatusChange({
          order, status, reason, changedBy,
        });
        results.push({ order_id: orderHumanId, success: true, order_status: updated.order_status });
      } catch (itemError) {
        results.push({ order_id: orderHumanId, success: false, error: itemError.message || "Unexpected error" });
      }
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
