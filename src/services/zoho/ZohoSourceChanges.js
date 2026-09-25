import { createHash } from "node:crypto";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import User from "../../models/User.js";
import Address from "../../models/Address.js";
import ZohoMapping from "../../models/ZohoMapping.js";

const productFields = "name sku type product_id combination_key combination_display regular_price sale_price status deleted_at hsn_sac accounting_unit zoho_tax_id";
export const sourceHash = async (kind, entityId) => {
  let source;
  if (kind === "contact") {
    source = [await User.findById(entityId).select("name email mobile phone_code gstin gst_treatment status").lean(),
      await Address.findOne({ user: entityId, deleted_at: null }).sort({ is_default: -1, updated_at: -1, _id: -1 }).select("full_name email phone phone_code address_line_1 address_line_2 city_name state_name country_name postcode gstin gst_treatment").lean()];
  } else {
    const model = kind === "variation" ? ProductVariation : Product;
    const item = await model.findById(entityId).select(productFields).lean();
    source = [item];
    if (kind === "variation" && item?.product_id) source.push(await Product.findById(item.product_id).select(productFields).lean());
  }
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
};

export const recordSource = async (connection, kind, entityId, identity, hash) => {
  await ZohoMapping.updateOne({ organization_id: connection.organization_id, kind: kind === "variation" ? "item" : kind, identity },
    { $set: { entity_id: entityId, entity_kind: kind, source_hash: hash, pending_hash: hash, checked_at: new Date() } });
};

export const reconcileSourceChanges = async (connection, enqueue) => {
  const mappings = await ZohoMapping.find({ organization_id: connection.organization_id, entity_id: { $exists: true }, state: "mapped" })
    .sort({ checked_at: 1 }).limit(50).lean();
  for (const mapping of mappings) {
    const hash = await sourceHash(mapping.entity_kind, mapping.entity_id);
    if (hash !== mapping.source_hash && hash !== mapping.pending_hash) {
      await enqueue(connection, mapping.entity_kind, mapping.entity_id, { retry: true });
      await ZohoMapping.updateOne({ _id: mapping._id }, { $set: { pending_hash: hash } });
    }
    await ZohoMapping.updateOne({ _id: mapping._id }, { $set: { checked_at: new Date() } });
  }
};
