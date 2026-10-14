// HSN sync for one product, driven from the product page: compare our code with
// Zoho Books item by item, then push or pull the rows the admin picks.
// A simple product is one Zoho item; a variable product's variations each are.
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { findExact } from "./ZohoMappingService.js";
import { syncItem } from "./ZohoItemService.js";

const VALID_HSN = /^(\d{4}|\d{6}|\d{8})$/;

export const normalizeHsn = (value) => {
  const code = String(value ?? "").replace(/\s+/g, "");
  return code || null;
};

// "pull" when only Zoho has a code, "push" when only we do (or Zoho has no
// item yet), "review" when both have different codes, "none" when they agree.
export const suggestDirection = ({ ours, zoho, inZoho }) => {
  if (!inZoho) return ours ? "push" : "none";
  if (ours === zoho) return "none";
  if (!ours) return VALID_HSN.test(zoho || "") ? "pull" : "none";
  if (!zoho) return "push";
  return "review";
};

const syncableItems = async (productId) => {
  const product = await Product.findOne({ _id: productId, deleted_at: null }).lean();
  if (!product) throw new ZohoError("PRODUCT_NOT_AVAILABLE");
  if (product.type !== "variable") return { product, items: [{ kind: "item", doc: product }] };
  const variations = await ProductVariation.find({ product_id: product._id, deleted_at: null }).sort({ _id: 1 }).lean();
  return { product, items: variations.map((doc) => ({ kind: "variation", doc })) };
};

// Read-only: finds the Zoho item by its stored id, else by exact SKU.
const findRemoteItem = async (connection, doc) => {
  if (doc.zoho_item_id && doc.zoho_organization_id === connection.organization_id) {
    const item = (await booksClient(connection, "GET", `items/${doc.zoho_item_id}`)).item;
    if (item) return item;
  }
  if (!doc.sku) return null;
  const match = await findExact(connection, "items", { sku: doc.sku }, (candidate) => candidate.sku === doc.sku);
  // List results can omit HSN; read the full item.
  return match ? (await booksClient(connection, "GET", `items/${match.item_id}`)).item : null;
};

const ourCode = (kind, doc, product) => normalizeHsn(doc.hsn_sac) || (kind === "variation" ? normalizeHsn(product.hsn_sac) : null);

export const compareProductHsn = async (connection, productId) => {
  const { product, items } = await syncableItems(productId);
  const rows = [];
  for (const { kind, doc } of items) {
    const remote = await findRemoteItem(connection, doc);
    const ours = ourCode(kind, doc, product);
    const zoho = normalizeHsn(remote?.hsn_or_sac);
    rows.push({
      kind, entity_id: String(doc._id), sku: doc.sku || null,
      name: kind === "variation" ? doc.combination_display || doc.combination_key || doc.sku : product.name,
      ours, inherited: kind === "variation" && !normalizeHsn(doc.hsn_sac) && Boolean(ours),
      in_zoho: Boolean(remote), zoho_item_id: remote?.item_id ? String(remote.item_id) : null, zoho,
      suggested: suggestDirection({ ours, zoho, inZoho: Boolean(remote) }),
    });
  }
  return { product: { _id: String(product._id), name: product.name, type: product.type, hsn_sac: normalizeHsn(product.hsn_sac) }, rows };
};

// Applies the chosen direction per row and reports each outcome.
export const applyProductHsn = async (connection, productId, actions) => {
  const { product, items } = await syncableItems(productId);
  const byId = new Map(items.map((entry) => [String(entry.doc._id), entry]));
  const results = [];
  for (const action of actions) {
    const entry = byId.get(action.entity_id);
    if (!entry) { results.push({ entity_id: action.entity_id, ok: false, error: "Not part of this product" }); continue; }
    const { kind, doc } = entry;
    try {
      if (action.direction === "pull") {
        const code = normalizeHsn((await findRemoteItem(connection, doc))?.hsn_or_sac);
        if (!code || !VALID_HSN.test(code)) throw new ZohoError("ZOHO_HSN_MISSING_OR_INVALID");
        // A variation equal to its product's code keeps inheriting it.
        const value = kind === "variation" && code === normalizeHsn(product.hsn_sac) ? null : code;
        await (kind === "variation" ? ProductVariation : Product).updateOne({ _id: doc._id }, { $set: { hsn_sac: value } });
        results.push({ entity_id: action.entity_id, ok: true, direction: "pull", hsn: code, own: value });
      } else {
        if (!ourCode(kind, doc, product)) throw new ZohoError("PRODUCT_HSN_REQUIRED");
        const itemId = await syncItem(connection, doc._id, kind === "variation");
        results.push({ entity_id: action.entity_id, ok: true, direction: "push", hsn: ourCode(kind, doc, product), zoho_item_id: String(itemId) });
      }
    } catch (error) {
      results.push({ entity_id: action.entity_id, ok: false, direction: action.direction,
        error: error instanceof ZohoError ? (error.detail?.message ? `${error.code}: ${error.detail.message}` : error.code) : "Sync failed" });
    }
  }
  return { results, product: { hsn_sac: normalizeHsn(product.hsn_sac) } };
};
