// Pure availability helpers — no model imports, so models can use them in
// hooks without a circular import.
import { STOCK_STATUS } from "../../constants/stock.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Units that can still be sold right now: on-hand minus units held by
// unpaid prepaid orders. Unmanaged SKUs are unlimited.
export const availableOf = (doc) => {
  if (!doc) return 0;
  if (doc.manage_stock === false) return Infinity;
  return Math.max(0, num(doc.stock_quantity) - num(doc.reserved_quantity));
};

// Whether `qty` units can be ordered. Backorders let a managed SKU sell past
// zero; inactive SKUs are never purchasable.
export const isPurchasable = (doc, qty = 1) => {
  if (!doc || doc.status === "inactive" || doc.deleted_at) return false;
  if (doc.manage_stock === false || doc.allow_backorders === true) return true;
  return availableOf(doc) >= num(qty);
};

export const deriveStockStatus = (doc) => {
  if (!doc) return STOCK_STATUS.OUT_OF_STOCK;
  if (doc.manage_stock === false) return STOCK_STATUS.IN_STOCK;
  if (availableOf(doc) > 0) return STOCK_STATUS.IN_STOCK;
  return doc.allow_backorders ? STOCK_STATUS.ON_BACKORDER : STOCK_STATUS.OUT_OF_STOCK;
};

// Aggregation expression for available units (`$`-prefixed field path base,
// e.g. "" for root or "variation." for a looked-up doc).
export const availableExpr = (prefix = "") => ({
  $max: [
    0,
    {
      $subtract: [
        { $ifNull: [`$${prefix}stock_quantity`, 0] },
        { $ifNull: [`$${prefix}reserved_quantity`, 0] },
      ],
    },
  ],
});

// Same rule as deriveStockStatus, as an aggregation-pipeline update so the
// status can be refreshed atomically right after a guarded $inc.
export const stockStatusPipelineSet = () => ({
  $set: {
    stock_status: {
      $switch: {
        branches: [
          { case: { $eq: ["$manage_stock", false] }, then: STOCK_STATUS.IN_STOCK },
          { case: { $gt: [availableExpr(), 0] }, then: STOCK_STATUS.IN_STOCK },
          { case: { $eq: ["$allow_backorders", true] }, then: STOCK_STATUS.ON_BACKORDER },
        ],
        default: STOCK_STATUS.OUT_OF_STOCK,
      },
    },
  },
});

// Low-stock check: per-SKU threshold, else the site-wide one.
export const isLowStock = (doc, siteThreshold) => {
  if (!doc || doc.manage_stock === false) return false;
  const threshold = doc.low_stock_threshold ?? siteThreshold;
  return availableOf(doc) <= num(threshold);
};

/**
 * Rewrites a catalog doc for shoppers: stock_quantity becomes the sellable
 * count (on-hand minus units held for unpaid orders), so storefront builds
 * that only know stock_quantity never offer reserved units. Also adds
 * available_quantity / stock_status / allow_backorders and recurses into
 * `variations`. Mutates and returns `doc`.
 */
export const toCustomerStock = (doc) => {
  if (!doc || typeof doc !== "object") return doc;
  if ("stock_quantity" in doc) {
    const managed = doc.manage_stock !== false;
    const available = managed ? availableOf(doc) : null;
    // A variable product's own counts are unused; its stored status is the
    // rollup of its variations.
    doc.stock_status = doc.type === "variable" && doc.stock_status ? doc.stock_status : deriveStockStatus(doc);
    doc.available_quantity = available;
    if (managed) doc.stock_quantity = available;
    doc.allow_backorders = doc.allow_backorders === true;
    doc.manage_stock = managed;
    delete doc.reserved_quantity;
  }
  if (Array.isArray(doc.variations)) doc.variations.forEach(toCustomerStock);
  return doc;
};
