// Sync one product with Zoho Books from the product page, field by field.
//
// Compare shows our value and Zoho's for every synced field of each Zoho item
// (a simple product is one item; each variation of a variable product is one).
// Apply runs the admin's choice per field: pull saves Zoho's value here; push
// updates only the chosen fields in Zoho, starting from Zoho's current item so
// skipped fields stay as they are there. Items missing in Zoho can be created.
// The SKU is the link between the two and is never changed here.
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { findExact } from "./ZohoMappingService.js";
import { syncItem } from "./ZohoItemService.js";
import { recordSource, sourceHash } from "./ZohoSourceChanges.js";

const VALID_HSN = /^(\d{4}|\d{6}|\d{8})$/;
const clean = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};
const money = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(Number(value).toFixed(2)));
const hsn = (value) => clean(value)?.replace(/\s+/g, "") || null;

// Each field: label, how to read ours and Zoho's, whether it can be pulled or
// pushed for this kind of item, how to validate and save a pulled value, and the
// Zoho payload key for a push.
const FIELDS = {
  name: {
    label: "Name",
    ours: (kind, doc, product) => clean(kind === "variation"
      ? [product.name, doc.combination_display || doc.combination_key].filter(Boolean).join(" - ").slice(0, 200)
      : product.name),
    zoho: (item) => clean(item.name),
    pullable: (kind) => kind === "item", // a variation's Zoho name is built from the product
    valid: (value) => !!value && value.length >= 2 && value.length <= 200,
    pull: (value) => ({ name: value }),
    push: (value) => ({ name: value }),
  },
  price: {
    label: "Selling price",
    ours: (_kind, doc) => money(doc.sale_price ?? doc.regular_price),
    zoho: (item) => money(item.rate),
    pullable: () => true,
    valid: (value) => value !== null && value >= 0,
    // Zoho has one rate: it updates the sale price when one is set, else the regular price.
    pull: (value, doc) => (doc.sale_price !== null && doc.sale_price !== undefined ? { sale_price: value } : { regular_price: value }),
    push: (value) => ({ rate: value }),
  },
  hsn: {
    label: "HSN",
    ours: (kind, doc, product) => hsn(doc.hsn_sac) || (kind === "variation" ? hsn(product.hsn_sac) : null),
    zoho: (item) => hsn(item.hsn_or_sac),
    pullable: () => true,
    valid: (value) => VALID_HSN.test(value || ""),
    // A variation whose code equals its product's keeps inheriting it.
    pull: (value, _doc, kind, product) => ({ hsn_sac: kind === "variation" && value === hsn(product.hsn_sac) ? null : value }),
    push: (value) => ({ hsn_or_sac: value }),
  },
  unit: {
    label: "Unit",
    ours: (kind, doc, product) => clean(doc.accounting_unit) || (kind === "variation" ? clean(product.accounting_unit) : null) || "pcs",
    zoho: (item) => clean(item.unit),
    pullable: () => true,
    valid: (value) => !!value && value.length <= 20,
    pull: (value) => ({ accounting_unit: value }),
    push: (value) => ({ unit: value }),
  },
  status: {
    label: "Status",
    ours: (_kind, doc) => (doc.status === "inactive" ? "inactive" : "active"),
    zoho: (item) => (item.status === "inactive" ? "inactive" : "active"),
    pullable: (kind) => kind === "item", // variation status is managed with the product
    pushable: (kind) => kind === "item",
    valid: (value) => value === "active" || value === "inactive",
    pull: (value) => ({ status: value }),
  },
};
export const FIELD_KEYS = Object.keys(FIELDS);

// "pull" when only Zoho has a value, "push" when only we do, "review" when both differ.
export const suggestField = ({ ours, zoho, pullable, pushable }) => {
  if (ours === zoho) return "none";
  if ((ours === null || ours === undefined) && pullable) return "pull";
  if ((zoho === null || zoho === undefined) && pushable) return "push";
  return "review";
};

const loadItems = async (productId) => {
  const product = await Product.findOne({ _id: productId, deleted_at: null }).lean();
  if (!product) throw new ZohoError("PRODUCT_NOT_AVAILABLE");
  if (product.type !== "variable") return { product, items: [{ kind: "item", doc: product }] };
  const variations = await ProductVariation.find({ product_id: product._id, deleted_at: null }).sort({ _id: 1 }).lean();
  return { product, items: variations.map((doc) => ({ kind: "variation", doc })) };
};

// Read-only lookup: stored Zoho item id, else exact SKU; always the full item.
const findRemoteItem = async (connection, doc) => {
  if (doc.zoho_item_id && doc.zoho_organization_id === connection.organization_id) {
    const item = (await booksClient(connection, "GET", `items/${doc.zoho_item_id}`)).item;
    if (item) return item;
  }
  if (!doc.sku) return null;
  const match = await findExact(connection, "items", { sku: doc.sku }, (candidate) => candidate.sku === doc.sku);
  return match ? (await booksClient(connection, "GET", `items/${match.item_id}`)).item : null;
};

const compareItem = (kind, doc, product, remote) => {
  const fields = FIELD_KEYS.map((key) => {
    const field = FIELDS[key];
    const ours = field.ours(kind, doc, product);
    const zoho = remote ? field.zoho(remote) : null;
    const pullable = !!remote && field.pullable(kind) && field.valid(zoho);
    const pushable = !!remote && (field.pushable ? field.pushable(kind) : true) && field.valid(ours);
    return { key, label: field.label, ours, zoho, pullable, pushable,
      suggested: remote ? suggestField({ ours, zoho, pullable, pushable }) : "none" };
  });
  return {
    kind, entity_id: String(doc._id), sku: doc.sku || null,
    name: kind === "variation" ? doc.combination_display || doc.combination_key || doc.sku : product.name,
    in_zoho: !!remote, zoho_item_id: remote?.item_id ? String(remote.item_id) : null,
    zoho_sku: remote ? clean(remote.sku) : null,
    sku_mismatch: !!remote && clean(remote.sku) !== clean(doc.sku),
    can_create: !remote && !!doc.sku && FIELDS.price.valid(FIELDS.price.ours(kind, doc, product)),
    fields,
  };
};

export const compareProduct = async (connection, productId) => {
  const { product, items } = await loadItems(productId);
  const rows = [];
  for (const { kind, doc } of items) rows.push(compareItem(kind, doc, product, await findRemoteItem(connection, doc)));
  return { product: { _id: String(product._id), name: product.name, type: product.type }, rows };
};

const readableError = (error) => (error instanceof ZohoError
  ? (error.detail?.message ? `${error.code}: ${error.detail.message}` : error.code)
  : "Sync failed");

// actions: [{ entity_id, create: true } | { entity_id, fields: { name: "pull" | "push", ... } }]
export const applyProduct = async (connection, productId, actions) => {
  const { product, items } = await loadItems(productId);
  const byId = new Map(items.map((entry) => [String(entry.doc._id), entry]));
  const results = [];
  for (const action of actions) {
    const entry = byId.get(action.entity_id);
    if (!entry) { results.push({ entity_id: action.entity_id, ok: false, error: "Not part of this product" }); continue; }
    const { kind, doc } = entry;
    const model = kind === "variation" ? ProductVariation : Product;
    try {
      if (action.create) {
        const itemId = await syncItem(connection, doc._id, kind === "variation");
        results.push({ entity_id: action.entity_id, ok: true, created: true, zoho_item_id: String(itemId) });
        continue;
      }
      const remote = await findRemoteItem(connection, doc);
      if (!remote) throw new ZohoError("ZOHO_ITEM_NOT_FOUND");
      if (clean(remote.sku) !== clean(doc.sku)) throw new ZohoError("MAPPED_SKU_CHANGED_REVIEW_REQUIRED");
      const row = compareItem(kind, doc, product, remote);
      const pulled = {};
      const pushed = {};
      let statusPush = null;
      for (const [key, direction] of Object.entries(action.fields || {})) {
        const field = FIELDS[key];
        const compared = row.fields.find((f) => f.key === key);
        if (!field || !compared || compared.ours === compared.zoho) continue;
        if (direction === "pull") {
          if (!compared.pullable) throw new ZohoError(`${key.toUpperCase()}_CANNOT_PULL`);
          Object.assign(pulled, field.pull(compared.zoho, doc, kind, product));
        } else if (direction === "push") {
          if (!compared.pushable) throw new ZohoError(`${key.toUpperCase()}_CANNOT_PUSH`);
          if (key === "status") statusPush = compared.ours;
          else Object.assign(pushed, field.push(compared.ours));
        }
      }
      if (Object.keys(pushed).length) {
        // Zoho's current values for everything not being pushed, so nothing else changes there.
        const payload = { name: remote.name, rate: remote.rate, unit: remote.unit, ...(remote.hsn_or_sac ? { hsn_or_sac: remote.hsn_or_sac } : {}), ...pushed };
        await booksClient(connection, "PUT", `items/${remote.item_id}`, { data: payload });
      }
      if (statusPush) await booksClient(connection, "POST", `items/${remote.item_id}/${statusPush}`);
      await model.updateOne({ _id: doc._id }, { $set: { ...pulled, zoho_item_id: String(remote.item_id), zoho_organization_id: connection.organization_id } });
      // Record the new state so the background worker doesn't push the whole item straight back.
      await recordSource(connection, kind, doc._id, doc.sku, await sourceHash(kind, doc._id));
      results.push({ entity_id: action.entity_id, ok: true, pulled, pushed: [...Object.keys(pushed), ...(statusPush ? ["status"] : [])] });
    } catch (error) {
      results.push({ entity_id: action.entity_id, ok: false, error: readableError(error) });
    }
  }
  return { results, ...(await compareProduct(connection, productId)) };
};
