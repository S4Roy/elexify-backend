import mongoose from "mongoose";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import "../../models/Media.js"; // registered for populate()
import SiteSetting from "../../models/SiteSetting.js";
import StockAlertSubscription from "../../models/StockAlertSubscription.js";
import StockAlertSettings from "../../models/StockAlertSettings.js";
import LowStockAlert from "../../models/LowStockAlert.js";
import { envs, logger } from "../../config/index.js";
import { emailBrand } from "../../config/emailBrand.js";
import { sendNotification } from "../notification/sendNotification.js";
import { sendEmail } from "../email/index.js";
import { ensureEmailTemplate } from "../emailTemplate/seedRunner.js";

// Stock alerts, run on a cron tick:
//  - runBackInStockCycle: one-time BACK_IN_STOCK notification to every
//    customer who asked "Notify me" once their product/variation is
//    purchasable again.
//  - runLowStockCycle: email digest to the configured admin inboxes listing
//    products/variations that newly dropped below the low-stock threshold
//    (SiteSetting "low_stock_threshold") or sold out.

const DEFAULT_THRESHOLD = 5;
const DIGEST_ITEM_LIMIT = 50;
const BACK_IN_STOCK_BATCH = 500;

const toId = (value) => (value ? new mongoose.Types.ObjectId(String(value)) : null);
const mediaUrl = (media) => (media?.url ? `${envs.s3.BASE_URL}${media.url}` : null);
const itemKey = (productId, variationId) => `${productId}:${variationId || ""}`;

export const getSettings = () => StockAlertSettings.getSingleton();

export const getLowStockThreshold = async () => {
  const setting = await SiteSetting.findOne({ slug: "low_stock_threshold" }).lean();
  const value = parseInt(setting?.value, 10);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_THRESHOLD;
};

export const setLowStockThreshold = async (value, actorId = null) => {
  await SiteSetting.updateOne(
    { slug: "low_stock_threshold" },
    {
      $set: { value: String(value), updated_at: new Date(), updated_by: actorId },
      $setOnInsert: { label: "Low Stock Threshold", type: "product_info", created_at: new Date() },
    },
    { upsert: true },
  );
};

/**
 * Whether a product (or one variation of it) can be bought right now, plus
 * the display details a request/alert needs. Returns null when the product
 * doesn't exist (or was deleted).
 */
export const describeItem = async (productId, variationId = null) => {
  const product = await Product.findOne({ _id: productId, deleted_at: null })
    .select("name slug type status stock_quantity sale_price regular_price images")
    .populate({ path: "images", select: "url", options: { limit: 1 } })
    .lean();
  if (!product) return null;
  let variation = null;
  if (variationId) {
    variation = await ProductVariation.findOne({ _id: variationId, product_id: product._id, deleted_at: null })
      .select("combination_display status stock_quantity sale_price regular_price images")
      .populate({ path: "images", select: "url", options: { limit: 1 } })
      .lean();
    if (!variation) return null;
  }
  const source = variation || product;
  const stock = source.stock_quantity;
  const purchasable = product.status === "active" && (!variation || variation.status === "active");
  return {
    product,
    variation,
    in_stock: purchasable && (stock == null || stock > 0),
    stock_quantity: stock,
    product_name: product.name,
    variation_name: variation?.combination_display || null,
    price: source.sale_price ?? source.regular_price ?? null,
    image_url: mediaUrl(variation?.images?.[0]) || mediaUrl(product.images?.[0]),
    product_url: `${emailBrand.storefrontUrl}/products/${product.slug}${variation ? `?variation_id=${variation._id}` : ""}`,
  };
};

// ── Customer requests ───────────────────────────────────────────────────────

export const subscribe = async ({ userId, productId, variationId = null, source = "web" }) => {
  const item = await describeItem(productId, variationId);
  if (!item) return { error: "not_found" };
  // A variable product's request must name the variation that's sold out.
  if (item.product.type === "variable" && !variationId) return { error: "variation_required" };
  if (item.in_stock) return { error: "in_stock" };
  const filter = { user_id: toId(userId), product_id: item.product._id, variation_id: item.variation?._id || null, status: "active" };
  const subscription = await StockAlertSubscription.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, source } },
    { upsert: true, new: true },
  ).catch(async (error) => {
    if (error?.code !== 11000) throw error;
    return StockAlertSubscription.findOne(filter);
  });
  return { subscription };
};

export const unsubscribe = async ({ userId, productId, variationId = null }) => {
  const result = await StockAlertSubscription.updateMany(
    { user_id: toId(userId), product_id: toId(productId), variation_id: toId(variationId), status: "active" },
    { $set: { status: "cancelled" } },
  );
  return result.modifiedCount;
};

// ── Back in stock ───────────────────────────────────────────────────────────

export const runBackInStockCycle = async () => {
  const settings = await getSettings();
  if (!settings.back_in_stock_enabled) return { notified: 0 };

  const groups = await StockAlertSubscription.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: { product_id: "$product_id", variation_id: "$variation_id" } } },
  ]);
  let notified = 0;
  for (const { _id: key } of groups) {
    const item = await describeItem(key.product_id, key.variation_id);
    if (!item) {
      // Product/variation deleted — nothing to wait for any more.
      await StockAlertSubscription.updateMany(
        { product_id: key.product_id, variation_id: key.variation_id, status: "active" },
        { $set: { status: "cancelled" } },
      );
      continue;
    }
    if (!item.in_stock) continue;

    const subscriptions = await StockAlertSubscription.find({
      product_id: key.product_id, variation_id: key.variation_id, status: "active",
    }).sort({ created_at: 1 }).limit(BACK_IN_STOCK_BATCH).lean();
    const data = {
      product_name: item.product_name,
      variation_name: item.variation_name,
      product_url: item.product_url,
      product_slug: item.product.slug,
      image_url: item.image_url,
      price: item.price,
    };
    for (const subscription of subscriptions) {
      // Claim first so overlapping ticks can't notify twice.
      const claim = await StockAlertSubscription.updateOne(
        { _id: subscription._id, status: "active" },
        { $set: { status: "notified", notified_at: new Date() } },
      );
      if (!claim.modifiedCount) continue;
      const result = await sendNotification({
        userId: subscription.user_id,
        event: "BACK_IN_STOCK",
        data,
        dedupeKey: String(subscription._id),
      });
      const channels = (result?.results || []).filter((r) => r.queued).map((r) => r.channel);
      await StockAlertSubscription.updateOne({ _id: subscription._id }, { $set: { channels } });
      notified++;
    }
  }
  return { notified };
};

// ── Low stock (admin digest) ────────────────────────────────────────────────

/**
 * Every active simple product and active variation (of an active variable
 * product) whose stock is below `threshold` — matches the dashboard's
 * low_stock/out_of_stock definition (stock < threshold, 0 = out).
 */
export const lowStockPipeline = (threshold) => [
  { $match: { type: "simple", deleted_at: null, status: "active", stock_quantity: { $lt: threshold } } },
  { $project: {
    product_id: "$_id", variation_id: null, name: 1, slug: 1, sku: 1, stock_quantity: 1,
    variation_name: null, image: { $arrayElemAt: ["$images", 0] },
  } },
  { $unionWith: {
    coll: "product_variations",
    pipeline: [
      { $match: { deleted_at: null, status: "active", stock_quantity: { $lt: threshold } } },
      { $lookup: { from: "products", localField: "product_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $match: { "product.deleted_at": null, "product.status": "active" } },
      { $project: {
        product_id: "$product._id", variation_id: "$_id", name: "$product.name", slug: "$product.slug",
        sku: { $ifNull: ["$sku", "$product.sku"] }, stock_quantity: 1, variation_name: "$combination_display",
        image: { $ifNull: [{ $arrayElemAt: ["$images", 0] }, { $arrayElemAt: ["$product.images", 0] }] },
      } },
    ],
  } },
];

export const runLowStockCycle = async () => {
  const settings = await getSettings();
  const recipients = (settings.low_stock_recipients || []).filter(Boolean);
  if (!settings.low_stock_alerts_enabled || !recipients.length) return { alerted: 0, resolved: 0 };

  const threshold = await getLowStockThreshold();
  const items = await Product.aggregate(lowStockPipeline(threshold));
  const current = new Map(items.map((item) => [itemKey(item.product_id, item.variation_id), item]));
  const open = await LowStockAlert.find({ resolved_at: null }).lean();
  const openByKey = new Map(open.map((row) => [itemKey(row.product_id, row.variation_id), row]));

  // Restocked (or removed) since the last alert — close so a future drop alerts again.
  const resolvedIds = open.filter((row) => !current.has(itemKey(row.product_id, row.variation_id))).map((row) => row._id);
  if (resolvedIds.length) await LowStockAlert.updateMany({ _id: { $in: resolvedIds } }, { $set: { resolved_at: new Date() } });

  const fresh = [];
  for (const [key, item] of current) {
    const level = item.stock_quantity <= 0 ? "out" : "low";
    const existing = openByKey.get(key);
    if (!existing) {
      try {
        await LowStockAlert.create({ product_id: item.product_id, variation_id: item.variation_id, level, stock_quantity: item.stock_quantity });
        fresh.push({ ...item, level });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    } else if (existing.level !== level || existing.stock_quantity !== item.stock_quantity) {
      await LowStockAlert.updateOne({ _id: existing._id }, { $set: { level, stock_quantity: item.stock_quantity } });
      if (existing.level === "low" && level === "out") fresh.push({ ...item, level });
    }
  }
  if (!fresh.length) return { alerted: 0, resolved: resolvedIds.length };

  fresh.sort((a, b) => a.stock_quantity - b.stock_quantity);
  const waiting = await StockAlertSubscription.aggregate([
    { $match: { status: "active", product_id: { $in: fresh.map((i) => i.product_id) } } },
    { $group: { _id: { p: "$product_id", v: "$variation_id" }, count: { $sum: 1 } } },
  ]);
  const waitingByKey = new Map(waiting.map((w) => [itemKey(w._id.p, w._id.v), w.count]));
  const shown = fresh.slice(0, DIGEST_ITEM_LIMIT).map((item) => ({
    product_name: item.name,
    variation_name: item.variation_name || null,
    sku: item.sku || null,
    stock_quantity: item.stock_quantity,
    level_label: item.level === "out" ? "Out of stock" : "Low stock",
    waiting: waitingByKey.get(itemKey(item.product_id, item.variation_id)) || 0,
  }));
  const data = {
    name: "Team",
    threshold,
    out_count: fresh.filter((i) => i.level === "out").length,
    low_count: fresh.filter((i) => i.level === "low").length,
    stock_items: shown,
    more_items_count: Math.max(0, fresh.length - shown.length),
    admin_url: process.env.ADMIN_PANEL_URL ? `${process.env.ADMIN_PANEL_URL.replace(/\/$/, "")}/inventory/stock-alerts` : null,
  };
  await ensureEmailTemplate("low_stock_alert");
  for (const email of recipients) {
    const ok = await sendEmail(email, "low_stock_alert", undefined, "en", data).catch(() => false);
    if (!ok) logger.error({ message: "Low stock alert email failed", recipient: email });
  }
  return { alerted: fresh.length, resolved: resolvedIds.length };
};
