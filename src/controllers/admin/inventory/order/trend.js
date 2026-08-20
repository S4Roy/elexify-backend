import Order from "../../../../models/Order.js";
import { dashboardHelper } from "../../../../helpers/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/admin/inventory/order/trend?from=YYYY-MM-DD&to=YYYY-MM-DD
 * (or legacy ?days=30, kept for compatibility)
 *
 * Order count + revenue over the given range, zero-filled so the series has
 * no gaps. Buckets by day for ranges up to ~2 months, and by month for
 * longer ranges (e.g. "This Year") — otherwise a year-long range would plot
 * 365 near-empty daily points instead of a readable trend.
 */
export const trend = async (req, res, next) => {
  try {
    const { from, to, days } = req.query;

    let startDate;
    let endDate;

    if (from || to) {
      startDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date(0);
      endDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    } else {
      const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 366);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date(endDate.getTime() - (n - 1) * DAY_MS);
      startDate.setHours(0, 0, 0, 0);
    }

    const spanDays = Math.max(1, Math.ceil((endDate - startDate) / DAY_MS));
    const groupBy = spanDays > 62 ? "month" : "day";
    const dateFormat = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

    const result = await Order.aggregate([
      {
        $match: {
          deleted_at: null,
          created_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: "$created_at" } },
          orders: { $sum: 1 },
          revenue: { $sum: dashboardHelper.revenueSumExpr() },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byKey = new Map(result.map((row) => [row._id, row]));
    const data = [];

    if (groupBy === "month") {
      const cursor = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
      );
      const endCursor = new Date(
        Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)
      );
      while (cursor <= endCursor) {
        const key = cursor.toISOString().slice(0, 7);
        const entry = byKey.get(key);
        data.push({
          date: key,
          orders: entry?.orders || 0,
          revenue: entry?.revenue || 0,
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(startDate.getTime() + i * DAY_MS);
        const key = d.toISOString().slice(0, 10);
        const entry = byKey.get(key);
        data.push({
          date: key,
          orders: entry?.orders || 0,
          revenue: entry?.revenue || 0,
        });
      }
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
