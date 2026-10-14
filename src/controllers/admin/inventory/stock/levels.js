import mongoose from "mongoose";
import Product from "../../../../models/Product.js";
import { envs } from "../../../../config/index.js";
import { availableExpr } from "../../../../services/stock/availability.js";
import { getLowStockThreshold } from "../../../../services/stockAlerts/index.js";

const skuFields = {
  sku: 1,
  stock_quantity: { $ifNull: ["$stock_quantity", 0] },
  reserved_quantity: { $ifNull: ["$reserved_quantity", 0] },
  available_quantity: { $cond: [{ $eq: ["$manage_stock", false] }, null, availableExpr()] },
  stock_status: 1,
  manage_stock: { $ne: ["$manage_stock", false] },
  allow_backorders: { $eq: ["$allow_backorders", true] },
  low_stock_threshold: 1,
  status: 1,
  updated_at: 1,
};

/**
 * GET /admin/inventory/stock/levels
 * One row per stock-keeping unit (simple products + live variations) with
 * on-hand, reserved and available quantities.
 */
export const levels = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, search_key = "", product = null, stock_status = null, low_stock = false } = req.query;
    const siteThreshold = await getLowStockThreshold();

    const productMatch = { deleted_at: null, type: { $ne: "variable" } };
    const variationMatch = { deleted_at: null };
    if (product) {
      productMatch._id = new mongoose.Types.ObjectId(product);
      variationMatch.product_id = new mongoose.Types.ObjectId(product);
    }

    const after = [];
    if (search_key) {
      const rx = { $regex: search_key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      after.push({ $match: { $or: [{ name: rx }, { sku: rx }, { variation_name: rx }] } });
    }
    if (stock_status) after.push({ $match: { stock_status } });
    if (String(low_stock) === "true") {
      after.push({ $match: { $expr: { $and: [
        { $eq: ["$manage_stock", true] },
        { $lte: ["$available_quantity", { $ifNull: ["$low_stock_threshold", siteThreshold] }] },
      ] } } });
    }

    const pipeline = [
      { $match: productMatch },
      { $project: { ...skuFields, product: "$_id", variation: null, name: 1, variation_name: null } },
      { $unionWith: {
        coll: "product_variations",
        pipeline: [
          { $match: variationMatch },
          { $lookup: { from: "products", localField: "product_id", foreignField: "_id", as: "parent", pipeline: [{ $project: { name: 1, deleted_at: 1 } }] } },
          { $unwind: "$parent" },
          { $match: { "parent.deleted_at": null } },
          { $project: { ...skuFields, product: "$product_id", variation: "$_id", name: "$parent.name", variation_name: "$combination_key" } },
        ],
      } },
      ...after,
    ];

    const data = await Product.aggregatePaginate(Product.aggregate(pipeline), {
      page, limit, sort: { available_quantity: 1, name: 1 },
    });
    data.low_stock_threshold = siteThreshold;

    res.status(200).json({ status: "success", message: req.__("List fetched successfully"), data });
  } catch (error) {
    next(error);
  }
};
