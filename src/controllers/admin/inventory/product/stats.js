import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import Category from "../../../../models/Category.js";
import User from "../../../../models/User.js";
import SiteSetting from "../../../../models/SiteSetting.js";
import Order from "../../../../models/Order.js"; // ✅ Import order model

export const stats = async (req, res, next) => {
  try {
    // Fetch threshold from DB
    const lowStockSetting = await SiteSetting.findOne({
      slug: "low_stock_threshold",
    });

    const LOW_STOCK_THRESHOLD = lowStockSetting?.value
      ? parseInt(lowStockSetting.value, 10)
      : 5;

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
      User.countDocuments({
        deleted_at: null,
        role: "customer",
        status: "active",
      }),

      // ✅ Total orders count
      Order.countDocuments({ deleted_at: null }),

      // ✅ Total revenue (only paid orders)
      Order.aggregate([
        { $match: { payment_status: "paid", deleted_at: null } },
        { $group: { _id: null, total: { $sum: "$grand_total" } } },
      ]),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Product statistics fetched successfully"),
      data: {
        simple_stats,
        variable_stats,
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
