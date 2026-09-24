import Order from "../../../../models/Order.js";
import { dashboardHelper } from "../../../../helpers/index.js";

const percentDelta = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const summarize = async (startDate, endDate, segment) => {
  const [orders, revenueResult] = await Promise.all([
    Order.countDocuments({
      deleted_at: null,
      ...segment,
      created_at: { $gte: startDate, $lte: endDate },
    }),
    Order.aggregate([
      {
        $match: {
          deleted_at: null,
          ...segment,
          ...dashboardHelper.revenueStatusMatch,
          created_at: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$grand_total" }, count: { $sum: 1 } } },
    ]),
  ]);

  const revenue = revenueResult[0]?.total || 0;
  const revenueOrders = revenueResult[0]?.count || 0;
  return {
    orders,
    revenue,
    // Average value of orders that count towards revenue.
    aov: revenueOrders ? revenue / revenueOrders : 0,
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
    const compare = req.query.compare === "previous_year" ? "previous_year" : "previous_period";
    const { prevStart, prevEnd } = dashboardHelper.getComparisonRange(startDate, endDate, compare);
    const segment = dashboardHelper.orderSegmentMatch(req.query);

    const [current, previous] = await Promise.all([
      summarize(startDate, endDate, segment),
      summarize(prevStart, prevEnd, segment),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Order performance fetched successfully"),
      data: {
        orders: current.orders,
        revenue: current.revenue,
        prev_orders: previous.orders,
        prev_revenue: previous.revenue,
        aov: Math.round(current.aov * 100) / 100,
        prev_aov: Math.round(previous.aov * 100) / 100,
        orders_delta_pct: percentDelta(current.orders, previous.orders),
        revenue_delta_pct: percentDelta(current.revenue, previous.revenue),
        aov_delta_pct: percentDelta(current.aov, previous.aov),
        compare,
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
