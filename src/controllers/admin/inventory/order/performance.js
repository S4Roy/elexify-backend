import Order from "../../../../models/Order.js";
import { dashboardHelper } from "../../../../helpers/index.js";

const percentDelta = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const summarize = async (startDate, endDate) => {
  const [orders, revenueResult] = await Promise.all([
    Order.countDocuments({
      deleted_at: null,
      created_at: { $gte: startDate, $lte: endDate },
    }),
    Order.aggregate([
      {
        $match: {
          deleted_at: null,
          ...dashboardHelper.revenueStatusMatch,
          created_at: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$grand_total" } } },
    ]),
  ]);

  return {
    orders,
    revenue: revenueResult[0]?.total || 0,
  };
};

/**
 * GET /api/admin/inventory/order/performance?from&to
 * Orders + revenue for the selected range, alongside the same metrics for
 * the immediately preceding period of equal length, so the dashboard can
 * show a period-over-period delta regardless of which range is active.
 */
export const performance = async (req, res, next) => {
  try {
    const { startDate, endDate } = dashboardHelper.resolveDateRange(
      req.query
    );
    const { prevStart, prevEnd } = dashboardHelper.getPreviousRange(
      startDate,
      endDate
    );

    const [current, previous] = await Promise.all([
      summarize(startDate, endDate),
      summarize(prevStart, prevEnd),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Order performance fetched successfully"),
      data: {
        orders: current.orders,
        revenue: current.revenue,
        prev_orders: previous.orders,
        prev_revenue: previous.revenue,
        orders_delta_pct: percentDelta(current.orders, previous.orders),
        revenue_delta_pct: percentDelta(current.revenue, previous.revenue),
        range: {
          from: startDate.toISOString().slice(0, 10),
          to: endDate.toISOString().slice(0, 10),
        },
        prev_range: {
          from: prevStart.toISOString().slice(0, 10),
          to: prevEnd.toISOString().slice(0, 10),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
