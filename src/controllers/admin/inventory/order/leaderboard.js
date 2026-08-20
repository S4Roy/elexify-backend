import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import { dashboardHelper } from "../../../../helpers/index.js";

/**
 * GET /api/admin/inventory/order/leaderboard?from&to&type=product|category&limit=5
 * Top products/categories by items sold (+ net sales) within a date range,
 * plus the true (untruncated) totals for the period — so a "top 5" list
 * that's cut off a 6th, smaller-selling entity doesn't look like it's
 * reporting the wrong number; the real total is always in `meta`.
 *
 * Only revenue-counted orders qualify (see helpers/dashboard/revenueMatch.js
 * for why this isn't payment_status === "paid" here), matching how
 * "revenue" is defined everywhere else on the dashboard (trend.js,
 * performance.js).
 *
 * A product can belong to multiple categories (Product.categories is an
 * array), so for type=category a multi-category product's sale is counted
 * toward every category it belongs to — the same convention WooCommerce
 * Analytics uses. `meta.total_items_sold` is still the true, un-inflated
 * total (summed once per order item, not once per category membership).
 */
export const leaderboard = async (req, res, next) => {
  try {
    const { type = "product", limit = 5 } = req.query;
    const { startDate, endDate } = dashboardHelper.resolveDateRange(
      req.query
    );
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 20);
    const emptyMeta = {
      total_items_sold: 0,
      total_net_sales: 0,
      distinct_count: 0,
    };

    const qualifyingOrders = await Order.find(
      {
        deleted_at: null,
        ...dashboardHelper.revenueStatusMatch,
        created_at: { $gte: startDate, $lte: endDate },
      },
      "_id"
    ).lean();

    if (!qualifyingOrders.length) {
      return res.status(200).json({
        status: "success",
        message: req.__("Leaderboard fetched successfully"),
        data: [],
        meta: emptyMeta,
      });
    }

    const orderIds = qualifyingOrders.map((o) => o._id);

    const groupPipeline =
      type === "category"
        ? [
            { $match: { order_id: { $in: orderIds } } },
            {
              $lookup: {
                from: "products",
                localField: "product_id",
                foreignField: "_id",
                as: "product",
              },
            },
            { $unwind: "$product" },
            { $unwind: "$product.categories" },
            {
              $group: {
                _id: "$product.categories",
                items_sold: { $sum: "$quantity" },
                net_sales: { $sum: "$total_price" },
              },
            },
          ]
        : [
            { $match: { order_id: { $in: orderIds } } },
            {
              $group: {
                _id: "$product_id",
                items_sold: { $sum: "$quantity" },
                net_sales: { $sum: "$total_price" },
              },
            },
          ];

    const refLookup =
      type === "category"
        ? [
            {
              $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "ref",
              },
            },
            { $unwind: "$ref" },
          ]
        : [
            {
              $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "ref",
              },
            },
            { $unwind: "$ref" },
          ];

    const [rows, distinctCountResult, rawTotals] = await Promise.all([
      OrderItem.aggregate([
        ...groupPipeline,
        ...refLookup,
        {
          $project: {
            _id: 0,
            id: "$_id",
            name: "$ref.name",
            slug: "$ref.slug",
            items_sold: 1,
            net_sales: 1,
          },
        },
        { $sort: { items_sold: -1 } },
        { $limit: safeLimit },
      ]),
      OrderItem.aggregate([...groupPipeline, { $count: "count" }]),
      // Summed once per order item regardless of `type` — this is the
      // real total, not inflated by a product's multiple category
      // memberships the way the category-grouped rows above can be.
      OrderItem.aggregate([
        { $match: { order_id: { $in: orderIds } } },
        {
          $group: {
            _id: null,
            total_items_sold: { $sum: "$quantity" },
            total_net_sales: { $sum: "$total_price" },
          },
        },
      ]),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Leaderboard fetched successfully"),
      data: rows,
      meta: {
        total_items_sold: rawTotals[0]?.total_items_sold || 0,
        total_net_sales: rawTotals[0]?.total_net_sales || 0,
        distinct_count: distinctCountResult[0]?.count || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
