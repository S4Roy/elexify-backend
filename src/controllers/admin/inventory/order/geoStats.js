import Order from "../../../../models/Order.js";
import User from "../../../../models/User.js";
import { dashboardHelper } from "../../../../helpers/index.js";

/**
 * GET /api/admin/inventory/order/geo-stats?from&to
 *
 * Orders/revenue and new-customer counts grouped by billing state, for the
 * dashboard's state map + geographic customer breakdown. Both are served
 * from one endpoint/one aggregation pass over states so the map and the
 * "where are our customers" view can share a single widget with a metric
 * switcher instead of needing two separate calls and shapes.
 *
 * `state_code` is the state's iso3166_2 (e.g. "IN-MH") — matches the
 * `iso3166-2` property on Highcharts' India admin1 map data
 * (@highcharts/map-collection), which is what the frontend joins on.
 */
export const geoStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = dashboardHelper.resolveDateRange(
      req.query
    );

    const [orderRows, customerRows] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            deleted_at: null,
            created_at: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "addresses",
            localField: "billing_address",
            foreignField: "_id",
            as: "address",
          },
        },
        { $unwind: "$address" },
        { $match: { "address.state": { $ne: null } } },
        {
          $lookup: {
            from: "states",
            localField: "address.state",
            foreignField: "id",
            as: "state",
          },
        },
        { $unwind: "$state" },
        {
          $group: {
            _id: "$state._id",
            state_name: { $first: "$state.name" },
            state_code: { $first: "$state.iso3166_2" },
            orders: { $sum: 1 },
            revenue: { $sum: dashboardHelper.revenueSumExpr() },
          },
        },
      ]),

      // New customers per state — one row per user even if they have both
      // a billing and a shipping address, billing preferred when present
      // (alphabetically "billing" < "shipping" makes the $sort below a
      // deterministic, no-extra-field way to pick it first per user).
      User.aggregate([
        {
          $match: {
            role: "customer",
            deleted_at: null,
            created_at: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: "addresses",
            localField: "_id",
            foreignField: "user",
            as: "addresses",
          },
        },
        { $unwind: "$addresses" },
        { $match: { "addresses.state": { $ne: null } } },
        { $sort: { "addresses.purpose": 1 } },
        { $group: { _id: "$_id", state: { $first: "$addresses.state" } } },
        {
          $lookup: {
            from: "states",
            localField: "state",
            foreignField: "id",
            as: "state_doc",
          },
        },
        { $unwind: "$state_doc" },
        {
          $group: {
            _id: "$state_doc._id",
            state_name: { $first: "$state_doc.name" },
            state_code: { $first: "$state_doc.iso3166_2" },
            new_customers: { $sum: 1 },
          },
        },
      ]),
    ]);

    const merged = new Map();
    for (const row of orderRows) {
      merged.set(row.state_code, {
        state_name: row.state_name,
        state_code: row.state_code,
        orders: row.orders,
        revenue: row.revenue,
        new_customers: 0,
      });
    }
    for (const row of customerRows) {
      const existing = merged.get(row.state_code);
      if (existing) {
        existing.new_customers = row.new_customers;
      } else {
        merged.set(row.state_code, {
          state_name: row.state_name,
          state_code: row.state_code,
          orders: 0,
          revenue: 0,
          new_customers: row.new_customers,
        });
      }
    }

    const data = [...merged.values()].sort((a, b) => b.revenue - a.revenue);

    res.status(200).json({
      status: "success",
      message: req.__("Geo stats fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
