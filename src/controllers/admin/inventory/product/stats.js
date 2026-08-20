import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import Category from "../../../../models/Category.js";
import User from "../../../../models/User.js";
import SiteSetting from "../../../../models/SiteSetting.js";
import Order from "../../../../models/Order.js"; // ✅ Import order model
import { dashboardHelper } from "../../../../helpers/index.js";

export const stats = async (req, res, next) => {
  try {
    // Fetch threshold from DB
    const lowStockSetting = await SiteSetting.findOne({
      slug: "low_stock_threshold",
    });

    const LOW_STOCK_THRESHOLD = lowStockSetting?.value
      ? parseInt(lowStockSetting.value, 10)
      : 5;

    // Customer count: scoped to signups within from/to when supplied (same
    // resolveDateRange standard as order/stats and order/trend), falling
    // back to the all-time count so existing callers keep working unchanged.
    const { from, to } = req.query;
    const customerMatch = {
      deleted_at: null,
      role: "customer",
      status: "active",
    };
    if (from || to) {
      const { startDate, endDate } = dashboardHelper.resolveDateRange(
        req.query
      );
      customerMatch.created_at = { $gte: startDate, $lte: endDate };
    }

    const [
      simple_stats,
      variable_stats,
      variable_count,
      category_count,
      customer_count,
      total_orders,
      total_revenue,
    ] = await Promise.all([
      // Simple products stats
      Product.aggregate([
        { $match: { type: "simple", deleted_at: null } },
        {
          $facet: {
            total: [{ $count: "count" }],
            low_stock: [
              {
                $match: {
                  stock_quantity: { $gt: 0, $lt: LOW_STOCK_THRESHOLD },
                },
              },
              { $count: "count" },
            ],
            out_of_stock: [
              { $match: { stock_quantity: 0 } },
              { $count: "count" },
            ],
          },
        },
      ]),

      // Variable product variations stats
      ProductVariation.aggregate([
        { $match: { deleted_at: null } },
        {
          $lookup: {
            from: "products",
            localField: "product_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $match: { "product.deleted_at": null } },
        {
          $facet: {
            low_stock: [
              {
                $match: {
                  stock_quantity: { $gt: 0, $lt: LOW_STOCK_THRESHOLD },
                },
              },
              { $count: "count" },
            ],
            out_of_stock: [
              { $match: { stock_quantity: 0 } },
              { $count: "count" },
            ],
          },
        },
      ]),

      // Variable product count
      Product.countDocuments({ type: "variable", deleted_at: null }),

      // Category count
      Category.countDocuments({ deleted_at: null, status: "active" }),

      // Customer count
      User.countDocuments(customerMatch),

      // ✅ Total orders count
      Order.countDocuments({ deleted_at: null }),

      // ✅ Total revenue (see helpers/dashboard/revenueMatch.js for why this
      // isn't payment_status === "paid")
      Order.aggregate([
        { $match: { deleted_at: null, ...dashboardHelper.revenueStatusMatch } },
        { $group: { _id: null, total: { $sum: "$grand_total" } } },
      ]),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Product statistics fetched successfully"),
      data: {
        simple_stats,
        variable_stats,
        simple_products: simple_stats[0]?.total?.[0]?.count || 0,
        variable_products: variable_count,
        total_products:
          (simple_stats[0]?.total?.[0]?.count || 0) + variable_count,
        low_stock:
          (simple_stats[0]?.low_stock?.[0]?.count || 0) +
          (variable_stats[0]?.low_stock?.[0]?.count || 0),
        out_of_stock:
          (simple_stats[0]?.out_of_stock?.[0]?.count || 0) +
          (variable_stats[0]?.out_of_stock?.[0]?.count || 0),
        total_categories: category_count,
        total_customers: customer_count,
        low_stock_threshold: LOW_STOCK_THRESHOLD,

        // ✅ New stats
        total_orders: total_orders,
        total_revenue: total_revenue[0]?.total || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
