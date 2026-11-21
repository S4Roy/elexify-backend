import mongoose from "mongoose";
import Product from "../../../../models/Product.js";
import Category from "../../../../models/Category.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";

/**
 * Filter facets for a product listing (optionally scoped to categories):
 * price bounds, in-stock count, rating and discount buckets, brands — each
 * with a product count, so the storefront can hide empty options and show
 * "(12)" next to the rest. Uses the same price / discount / stock rules as
 * the product list (sale price when > 0; stock from `stock_quantity`).
 *
 * GET /site/inventory/product/facets?category=slug-a,slug-b&currency=INR
 */
export const facets = async (req, res, next) => {
  try {
    const { category = null, currency = "INR" } = req.query;
    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const rate = rates?.rates?.get(currency) ?? 1;

    const match = { deleted_at: null, status: "active", type: "simple" };
    if (category) {
      const slugs = String(category).split(",").map((s) => s.trim()).filter(Boolean);
      const found = await Category.find({ slug: { $in: slugs }, deleted_at: null }).select("_id").lean();
      const ids = found.map((c) => new mongoose.Types.ObjectId(c._id));
      match.$or = [{ categories: { $in: ids } }, { sub_categories: { $in: ids } }];
    }

    const [result] = await Product.aggregate([
      { $match: match },
      {
        $addFields: {
          price: {
            $multiply: [{ $cond: [{ $gt: ["$sale_price", 0] }, "$sale_price", "$regular_price"] }, rate],
          },
          discount: {
            $cond: [
              { $and: [{ $gt: ["$regular_price", 0] }, { $gt: ["$sale_price", 0] }] },
              { $multiply: [{ $divide: [{ $subtract: ["$regular_price", "$sale_price"] }, "$regular_price"] }, 100] },
              0,
            ],
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                in_stock: { $sum: { $cond: [{ $gt: ["$stock_quantity", 0] }, 1, 0] } },
                min_price: { $min: "$price" },
                max_price: { $max: "$price" },
                rating_4: { $sum: { $cond: [{ $gte: ["$avg_rating", 4] }, 1, 0] } },
                rating_3: { $sum: { $cond: [{ $gte: ["$avg_rating", 3] }, 1, 0] } },
                discount_10: { $sum: { $cond: [{ $gte: ["$discount", 10] }, 1, 0] } },
                discount_25: { $sum: { $cond: [{ $gte: ["$discount", 25] }, 1, 0] } },
                discount_50: { $sum: { $cond: [{ $gte: ["$discount", 50] }, 1, 0] } },
              },
            },
          ],
          brands: [
            { $match: { brand: { $ne: null } } },
            { $group: { _id: "$brand", count: { $sum: 1 } } },
            { $lookup: { from: "brands", localField: "_id", foreignField: "_id", as: "brand" } },
            { $unwind: "$brand" },
            { $match: { "brand.deleted_at": null } },
            { $project: { _id: 0, name: "$brand.name", slug: "$brand.slug", count: 1 } },
            { $sort: { count: -1, name: 1 } },
          ],
          // Parametric specs (Power Rating, Secondary Voltage, …) with a
          // product count per value — one filter section per key.
          specs: [
            {
              $lookup: {
                from: "product_specifications",
                let: { pid: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$product_id", "$$pid"] }, deleted_at: null, status: "active" } },
                  { $project: { _id: 0, key: 1, value_string: 1, value_number: 1 } },
                ],
                as: "spec",
              },
            },
            { $unwind: "$spec" },
            {
              $group: {
                _id: { key: "$spec.key", value: "$spec.value_string" },
                n: { $min: "$spec.value_number" },
                count: { $sum: 1 },
              },
            },
            { $sort: { n: 1, "_id.value": 1 } },
            { $group: { _id: "$_id.key", values: { $push: { value: "$_id.value", count: "$count" } } } },
            { $lookup: { from: "specifications", localField: "_id", foreignField: "key", as: "m" } },
            { $unwind: "$m" },
            { $match: { "m.deleted_at": null, "m.status": "active", "m.visible": { $ne: false } } },
            { $project: { _id: 0, key: "$_id", label: "$m.label", unit: "$m.unit", order: "$m.sort_order", values: 1 } },
            { $sort: { order: 1 } },
          ],
        },
      },
    ]);

    const t = result?.totals?.[0] ?? {};
    res.status(200).json({
      status: "success",
      data: {
        total: t.total ?? 0,
        in_stock: t.in_stock ?? 0,
        price: {
          min: Math.floor(t.min_price ?? 0),
          max: Math.ceil(t.max_price ?? 0),
        },
        rating: [
          { min: 4, count: t.rating_4 ?? 0 },
          { min: 3, count: t.rating_3 ?? 0 },
        ],
        discount: [
          { min: 50, count: t.discount_50 ?? 0 },
          { min: 25, count: t.discount_25 ?? 0 },
          { min: 10, count: t.discount_10 ?? 0 },
        ],
        brands: result?.brands ?? [],
        // Only keys with a real choice (2+ values) are worth a filter.
        specs: (result?.specs ?? []).filter((s) => s.values.length > 1),
      },
    });
  } catch (error) {
    next(error);
  }
};
