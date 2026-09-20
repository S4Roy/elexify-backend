import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { findExact, syncMapped } from "./ZohoMappingService.js";
import { sourceHash, recordSource } from "./ZohoSourceChanges.js";
import ZohoMapping from "../../models/ZohoMapping.js";

export const syncItem = async (connection, entityId, variation = false, expectedSku = null, ensureOnly = false) => {
  const kind = variation ? "variation" : "item";
  const hash = await sourceHash(kind, entityId);
  const model = variation ? ProductVariation : Product;
  const item = await model.findById(entityId).lean();
  if (!item || item.deleted_at) throw new ZohoError("PRODUCT_NOT_AVAILABLE");
  if (!variation && item.type === "variable") throw new ZohoError("SYNC_VARIATIONS_NOT_PARENT");
  const parent = variation ? await Product.findById(item.product_id).lean() : item;
  if (!item.sku || !parent) throw new ZohoError("PRODUCT_SKU_REQUIRED");
  if (expectedSku && item.sku !== expectedSku) throw new ZohoError("HISTORICAL_SKU_CHANGED_REVIEW_REQUIRED");
  if (await ZohoMapping.exists({ organization_id: connection.organization_id, kind: "item", entity_id: item._id, identity: { $ne: item.sku } })) {
    throw new ZohoError("MAPPED_SKU_CHANGED_REVIEW_REQUIRED");
  }
  if (ensureOnly) {
    const mapped = await ZohoMapping.findOne({ organization_id: connection.organization_id, kind: "item", identity: item.sku, state: "mapped", source_hash: hash }).lean();
    if (mapped?.remote_id) return mapped.remote_id;
  }
  const collisions = await Promise.all([
    Product.countDocuments({ sku: item.sku, deleted_at: null, ...(variation ? {} : { _id: { $ne: entityId } }) }),
    ProductVariation.countDocuments({ sku: item.sku, deleted_at: null, ...(variation ? { _id: { $ne: entityId } } : {}) }),
  ]);
  if (collisions.some(Boolean)) throw new ZohoError("LOCAL_SKU_COLLISION");
  const price = item.sale_price ?? item.regular_price;
  if (price == null || !Number.isFinite(Number(price)) || price < 0) throw new ZohoError("PRODUCT_PRICE_REQUIRED");
  const payload = { sku: item.sku, name: [parent.name, variation ? item.combination_display || item.combination_key : null].filter(Boolean).join(" - ").slice(0, 200),
    rate: Number(price), product_type: "goods", item_type: "sales", unit: item.accounting_unit || parent.accounting_unit || "pcs",
    ...(item.hsn_sac || parent.hsn_sac ? { hsn_or_sac: item.hsn_sac || parent.hsn_sac } : {}),
    ...(item.zoho_tax_id || parent.zoho_tax_id ? { tax_id: item.zoho_tax_id || parent.zoho_tax_id } : {}),
  };
  const remote = await syncMapped({ connection, kind: "item", identity: item.sku, path: "items", singular: "item", payload,
    lookup: async () => {
      if (item.zoho_item_id && item.zoho_organization_id === connection.organization_id) {
        const existing = (await booksClient(connection, "GET", `items/${item.zoho_item_id}`)).item;
        if (existing?.sku !== item.sku) throw new ZohoError("MAPPED_SKU_CHANGED_REVIEW_REQUIRED");
        return existing;
      }
      return findExact(connection, "items", { sku: item.sku }, candidate => candidate.sku === item.sku);
    },
  });
  await booksClient(connection, "POST", `items/${remote.item_id}/${item.status === "active" ? "active" : "inactive"}`);
  await model.updateOne({ _id: item._id }, { $set: { zoho_item_id: remote.item_id, zoho_organization_id: connection.organization_id } });
  await recordSource(connection, kind, entityId, item.sku, hash);
  return remote.item_id;
};
