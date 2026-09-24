import Order from "../../../../models/Order.js";
import { dashboardHelper } from "../../../../helpers/index.js";

/**
 * GET /api/admin/inventory/order/stats?from&to&channel&payment
 * Order counts grouped by current status for the dashboard's date range and
 * segment filters (all-time when no range is given, as before).
 */
export const stats = async (req, res, next) => {
  try {
    const match = { deleted_at: null, ...dashboardHelper.orderSegmentMatch(req.query) };
    if (req.query.from || req.query.to) {
      const { startDate, endDate } = dashboardHelper.resolveDateRange(req.query);
      match.created_at = { $gte: startDate, $lte: endDate };
    }
    const result = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$order_status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          order_status: "$_id",
          count: 1,
        },
      },
      {
        $sort: {
          order_status: -1, // sort by count descending; change to 1 for ascending
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Order status counts fetched successfully"),
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
