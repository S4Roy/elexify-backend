import mongoose from "mongoose";
import StockTransaction from "../../../../models/StockTransaction.js";
import { envs } from "../../../../config/index.js";

const toId = (value) => (value ? new mongoose.Types.ObjectId(String(value)) : null);

/**
 * GET /admin/inventory/stock/transactions
 * Stock movement history (the ledger), newest first, filterable by SKU,
 * type, reason, actor and date.
 */
export const list = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, product, variation, type, reason, actor_type, from, to, sort_order = -1 } = req.query;

    const match = { deleted_at: null };
    if (product) match.product = toId(product);
    if (variation) match.variation = toId(variation);
    if (type) match.type = type;
    if (reason) match.reason = reason;
    if (actor_type) match.actor_type = actor_type;
    if (from || to) {
      match.created_at = {};
      if (from) match.created_at.$gte = new Date(from);
      if (to) match.created_at.$lte = new Date(to);
    }

    const pipeline = [
      { $match: match },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "product_doc", pipeline: [{ $project: { name: 1, sku: 1 } }] } },
      { $lookup: { from: "product_variations", localField: "variation", foreignField: "_id", as: "variation_doc", pipeline: [{ $project: { sku: 1, combination_key: 1 } }] } },
      { $lookup: { from: "users", localField: "created_by", foreignField: "_id", as: "actor", pipeline: [{ $project: { name: 1, email: 1 } }] } },
      { $lookup: { from: "orders", localField: "reference_id", foreignField: "_id", as: "order_doc", pipeline: [{ $project: { id: 1 } }] } },
      { $project: {
        type: 1, quantity: 1, delta: 1, balance_after: 1, reason: 1, note: 1,
        reference_id: 1, reference_type: 1, actor_type: 1,
        mrp: 1, cost_price: 1, selling_price: 1, created_at: 1,
        product: { _id: "$product", name: { $first: "$product_doc.name" }, sku: { $first: "$product_doc.sku" } },
        variation: { $cond: ["$variation", {
          _id: "$variation", sku: { $first: "$variation_doc.sku" }, name: { $first: "$variation_doc.combination_key" },
        }, null] },
        created_by: { $first: "$actor" },
        order_number: { $first: "$order_doc.id" },
      } },
    ];

    const data = await StockTransaction.aggregatePaginate(StockTransaction.aggregate(pipeline), {
      page, limit, sort: { created_at: Number(sort_order) || -1, _id: Number(sort_order) || -1 },
    });

    res.status(200).json({ status: "success", message: req.__("List fetched successfully"), data });
  } catch (error) {
    next(error);
  }
};
