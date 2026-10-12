import Order from "../../../../models/Order.js";
import { dashboardHelper } from "../../../../helpers/index.js";
import { STORE_TIMEZONE, addDaysYmd, addMonthsYm, istYmd } from "../../../../config/storeTime.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/admin/inventory/order/trend?from=YYYY-MM-DD&to=YYYY-MM-DD (IST days)
 * (or legacy ?days=30, kept for compatibility)
 *
 * Order count + revenue over the given range, zero-filled so the series has
 * no gaps. Buckets by day for ranges up to ~2 months, and by month for
 * longer ranges (e.g. "This Year") — otherwise a year-long range would plot
 * 365 near-empty daily points instead of a readable trend.
 */
export const trend = async (req, res, next) => {
  try {
    const { startDate, endDate } = dashboardHelper.resolveDateRange(req.query);

    const spanDays = Math.max(1, Math.ceil((endDate - startDate) / DAY_MS));
    const groupBy = spanDays > 62 ? "month" : "day";
    const dateFormat = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

    const result = await Order.aggregate([
      {
        $match: {
          deleted_at: null,
          ...dashboardHelper.orderSegmentMatch(req.query),
          created_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: "$created_at", timezone: STORE_TIMEZONE } },
          orders: { $sum: 1 },
          revenue: { $sum: dashboardHelper.revenueSumExpr() },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byKey = new Map(result.map((row) => [row._id, row]));
    const data = [];

    // Zero-fill every IST day/month in the range.
    const keys = [];
    if (groupBy === "month") {
      const last = istYmd(endDate).slice(0, 7);
      for (let key = istYmd(startDate).slice(0, 7); key <= last && keys.length < 1000; key = addMonthsYm(key, 1)) keys.push(key);
    } else {
      const last = istYmd(endDate);
      for (let key = istYmd(startDate); key <= last && keys.length < 1000; key = addDaysYmd(key, 1)) keys.push(key);
    }
    for (const key of keys) {
      const entry = byKey.get(key);
      data.push({ date: key, orders: entry?.orders || 0, revenue: entry?.revenue || 0 });
    }

    res.status(200).json({
      status: "success",
      message: req.__("Order trend fetched successfully"),
      data,
      meta: { group_by: groupBy },
    });
  } catch (error) {
    next(error);
  }
};
