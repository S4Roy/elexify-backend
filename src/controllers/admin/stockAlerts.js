import mongoose from "mongoose";
import Product from "../../models/Product.js";
import StockAlertSubscription from "../../models/StockAlertSubscription.js";
import LowStockAlert from "../../models/LowStockAlert.js";
import { envs, StatusError } from "../../config/index.js";
import { auditService } from "../../services/index.js";
import { getLowStockThreshold, getSettings, lowStockPipeline, setLowStockThreshold } from "../../services/stockAlerts/index.js";

// Admin "Stock Alerts": what needs restocking (low/out of stock, with how
// many customers are waiting) and back-in-stock demand from "Notify me".
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mediaUrlExpr = (field) => ({
  $cond: [{ $ifNull: [field, false] }, { $concat: [envs.s3.BASE_URL || "", field] }, null],
});

const waitingLookup = [
  { $lookup: {
    from: "stock_alert_subscriptions",
    let: { p: "$product_id", v: "$variation_id" },
    pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$product_id", "$$p"] }, { $eq: ["$variation_id", "$$v"] }, { $eq: ["$status", "active"] }] } } },
      { $count: "count" },
    ],
    as: "waiting",
  } },
  { $addFields: { waiting: { $ifNull: [{ $arrayElemAt: ["$waiting.count", 0] }, 0] } } },
];

export const lowStock = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, level, search } = req.query;
    const threshold = await getLowStockThreshold();
    const pipeline = lowStockPipeline(threshold);
    if (level === "out") pipeline.push({ $match: { stock_quantity: { $lte: 0 } } });
    if (level === "low") pipeline.push({ $match: { stock_quantity: { $gt: 0 } } });
    const term = search ? String(search).trim() : "";
    if (term) {
      const regex = new RegExp(escapeRegex(term), "i");
      pipeline.push({ $match: { $or: [{ name: regex }, { sku: regex }, { variation_name: regex }] } });
    }
    pipeline.push(
      ...waitingLookup,
      { $lookup: { from: "medias", localField: "image", foreignField: "_id", as: "image" } },
      { $addFields: { image_url: mediaUrlExpr({ $arrayElemAt: ["$image.url", 0] }) } },
      { $lookup: {
        from: "low_stock_alerts",
        let: { p: "$product_id", v: "$variation_id" },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$product_id", "$$p"] }, { $eq: ["$variation_id", "$$v"] }, { $eq: ["$resolved_at", null] }] } } }],
        as: "alert",
      } },
      { $addFields: { alerted_at: { $arrayElemAt: ["$alert.alerted_at", 0] } } },
      { $project: { image: 0, alert: 0 } },
      // Most urgent first: sold out with people waiting, then lowest stock.
      { $sort: { stock_quantity: 1, waiting: -1, name: 1 } },
    );
    const data = await Product.aggregatePaginate(Product.aggregate(pipeline), { page, limit });
    res.status(200).json({ status: "success", message: "Low stock items fetched successfully", data: { ...data, threshold } });
  } catch (error) { next(error); }
};

export const requests = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, search } = req.query;
    const pipeline = [
      { $match: { status: "active" } },
      { $group: {
        _id: { product_id: "$product_id", variation_id: "$variation_id" },
        waiting: { $sum: 1 },
        first_requested_at: { $min: "$created_at" },
        last_requested_at: { $max: "$created_at" },
      } },
      { $project: { _id: 0, product_id: "$_id.product_id", variation_id: "$_id.variation_id", waiting: 1, first_requested_at: 1, last_requested_at: 1 } },
      { $lookup: { from: "products", localField: "product_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $lookup: { from: "product_variations", localField: "variation_id", foreignField: "_id", as: "variation" } },
      { $addFields: { variation: { $arrayElemAt: ["$variation", 0] } } },
      { $addFields: {
        name: "$product.name",
        slug: "$product.slug",
        variation_name: "$variation.combination_display",
        sku: { $ifNull: ["$variation.sku", "$product.sku"] },
        stock_quantity: { $cond: [{ $ifNull: ["$variation_id", false] }, "$variation.stock_quantity", "$product.stock_quantity"] },
        image: { $ifNull: [{ $arrayElemAt: ["$variation.images", 0] }, { $arrayElemAt: ["$product.images", 0] }] },
      } },
    ];
    const term = search ? String(search).trim() : "";
    if (term) {
      const regex = new RegExp(escapeRegex(term), "i");
      pipeline.push({ $match: { $or: [{ name: regex }, { sku: regex }, { variation_name: regex }] } });
    }
    pipeline.push(
      { $lookup: { from: "medias", localField: "image", foreignField: "_id", as: "image" } },
      { $addFields: { image_url: mediaUrlExpr({ $arrayElemAt: ["$image.url", 0] }) } },
      { $project: { product: 0, variation: 0, image: 0 } },
      { $sort: { waiting: -1, last_requested_at: -1 } },
    );
    const data = await StockAlertSubscription.aggregatePaginate(StockAlertSubscription.aggregate(pipeline), { page, limit });
    const [totals] = await StockAlertSubscription.aggregate([
      { $group: {
        _id: null,
        waiting: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        notified_30d: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "notified"] }, { $gte: ["$notified_at", new Date(Date.now() - 30 * 86400000)] }] }, 1, 0] } },
      } },
    ]);
    res.status(200).json({ status: "success", message: "Back in stock requests fetched successfully", data: {
      ...data, totals: { waiting: totals?.waiting || 0, notified_30d: totals?.notified_30d || 0 },
    } });
  } catch (error) { next(error); }
};

// Customers behind one product/variation's requests (waiting + recently notified).
export const subscribers = async (req, res, next) => {
  try {
    const { product_id, variation_id } = req.query;
    if (!isId(product_id) || (variation_id && !isId(variation_id))) throw StatusError.badRequest("A valid product is required.");
    const rows = await StockAlertSubscription.find({
      product_id,
      variation_id: variation_id || null,
      status: { $in: ["active", "notified"] },
    })
      .populate({ path: "user_id", select: "name email phone_code mobile" })
      .sort({ status: 1, created_at: -1 })
      .limit(200)
      .lean();
    res.status(200).json({ status: "success", message: "Subscribers fetched successfully", data: rows.map((row) => ({
      _id: row._id,
      status: row.status,
      source: row.source,
      created_at: row.created_at,
      notified_at: row.notified_at,
      channels: row.channels,
      customer: row.user_id ? { _id: row.user_id._id, name: row.user_id.name, email: row.user_id.email,
        mobile: row.user_id.mobile ? [row.user_id.phone_code, row.user_id.mobile].filter(Boolean).join(" ") : null } : null,
    })) });
  } catch (error) { next(error); }
};

export const getSettingsHandler = async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.status(200).json({ status: "success", message: "Stock alert settings fetched successfully", data: {
      ...settings.toObject(),
      low_stock_threshold: await getLowStockThreshold(),
      open_low_stock_alerts: await LowStockAlert.countDocuments({ resolved_at: null }),
    } });
  } catch (error) { next(error); }
};

export const updateSettings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const settings = await getSettings();
    if (body.back_in_stock_enabled !== undefined) settings.back_in_stock_enabled = !!body.back_in_stock_enabled;
    if (body.low_stock_alerts_enabled !== undefined) settings.low_stock_alerts_enabled = !!body.low_stock_alerts_enabled;
    if (body.low_stock_recipients !== undefined) {
      const list = (Array.isArray(body.low_stock_recipients) ? body.low_stock_recipients : String(body.low_stock_recipients).split(/[,\s]+/))
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean);
      const invalid = list.find((email) => !EMAIL.test(email));
      if (invalid) throw StatusError.badRequest(`"${invalid}" is not a valid email address.`);
      if (list.length > 10) throw StatusError.badRequest("Add up to 10 recipient emails.");
      settings.low_stock_recipients = [...new Set(list)];
    }
    if (settings.low_stock_alerts_enabled && !settings.low_stock_recipients.length) {
      throw StatusError.badRequest("Add at least one recipient email to turn on low-stock alerts.");
    }
    if (body.low_stock_threshold !== undefined) {
      const threshold = Number(body.low_stock_threshold);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 10000) {
        throw StatusError.badRequest("Low-stock threshold must be a whole number between 1 and 10000.");
      }
      await setLowStockThreshold(threshold, req.auth?.user_id || null);
    }
    await settings.save();
    await auditService.recordAudit({
      userId: null, event: "STOCK_ALERT_SETTINGS_UPDATED", req, actorId: req.auth?.user_id || null,
      metadata: {
        back_in_stock_enabled: settings.back_in_stock_enabled,
        low_stock_alerts_enabled: settings.low_stock_alerts_enabled,
        low_stock_recipients: settings.low_stock_recipients.length,
        low_stock_threshold: body.low_stock_threshold,
      },
    });
    res.status(200).json({ status: "success", message: "Stock alert settings saved", data: {
      ...settings.toObject(), low_stock_threshold: await getLowStockThreshold(),
    } });
  } catch (error) { next(error); }
};
