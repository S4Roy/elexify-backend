import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Package from "../../models/Package.js";
import Invoice from "../../models/Invoice.js";
import { syncContact } from "./ZohoContactService.js";
import { syncItem } from "./ZohoItemService.js";
import { findExact, syncMapped } from "./ZohoMappingService.js";
import { salesOrderPayload } from "./salesOrderPayload.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { zohoAddress } from "./customerPayload.js";

export const assertOrderEligible = order => {
  if (!order || order.deleted_at || !order.zoho?.packed_at) throw new ZohoError("ORDER_NOT_PACKED");
  if (["cancelled", "returned", "return_requested", "failed"].includes(order.order_status) ||
      order.inventory_reverted || ["refund_pending", "refunded", "partially_refunded", "refund_failed"].includes(order.payment_status)) {
    throw new ZohoError("ORDER_LIFECYCLE_REVIEW_REQUIRED");
  }
  if (order.payment_method !== "cod" && !["paid", "advance_paid"].includes(order.payment_status)) throw new ZohoError("ORDER_PAYMENT_NOT_CONFIRMED");
  if (order.is_partial_cod && !["paid", "advance_paid"].includes(order.payment_status)) throw new ZohoError("ORDER_PAYMENT_NOT_CONFIRMED");
};

export const syncSalesOrder = async (connection, orderId) => {
  const order = await Order.findById(orderId).lean();
  assertOrderEligible(order);
  if (await Invoice.exists({ order_id: orderId, "zoho.invoice_id": { $type: "string" } })) {
    throw new ZohoError("EXISTING_INVOICE_REVIEW_REQUIRED");
  }
  const [items, packages] = await Promise.all([
    OrderItem.find({ order_id: orderId }).lean(), Package.find({ order_id: orderId }).lean(),
  ]);
  if (!order.billing_address_snapshot || !order.shipping_address_snapshot) throw new ZohoError("ORDER_ADDRESS_SNAPSHOT_REQUIRED");
  const itemIds = new Map(items.map(item => [String(item._id), "validation"]));
  salesOrderPayload({ order, items, customerId: "validation", itemIds, connection, packages });
  const customerId = await syncContact(connection, order.user, order);
  for (const item of items) {
    itemIds.set(String(item._id), await syncItem(connection, item.variation_id || item.product_id, Boolean(item.variation_id), item.sku, true));
  }
  assertOrderEligible(await Order.findById(orderId).lean());
  const payload = salesOrderPayload({ order, items, customerId, itemIds, connection, packages });
  await validateTaxMappings(connection, items);
  const remote = await syncMapped({ connection, kind: "salesorder", identity: String(order._id),
    path: "salesorders", singular: "salesorder", payload,
    lookup: () => findExact(connection, "salesorders", { reference_number: order.id }, candidate => candidate.reference_number === order.id),
    beforeUpdate: async remoteId => {
      const existing = (await booksClient(connection, "GET", `salesorders/${remoteId}`)).salesorder;
      if (!existing || !["draft", "open"].includes(existing.status) || existing.invoices?.length ||
          existing.customer_id !== customerId) throw new ZohoError("REMOTE_SALESORDER_LOCKED_REVIEW_REQUIRED");
    },
  });
  await Order.updateOne({ _id: orderId }, { $set: { "zoho.organization_id": connection.organization_id,
    "zoho.salesorder_id": remote.salesorder_id, "zoho.salesorder_number": remote.salesorder_number } });
  if (Math.abs(Math.round(Number(remote.total) * 100) - Math.round(order.grand_total * 100)) > 1 || !Number.isFinite(Number(remote.total))) {
    throw new ZohoError("REMOTE_TOTAL_MISMATCH_REVIEW_REQUIRED");
  }
  const expectedTax = items.reduce((sum, item) => sum + Math.round(item.tax_amount * 100), 0);
  if (!Number.isFinite(Number(remote.tax_total)) || Math.abs(Math.round(Number(remote.tax_total) * 100) - expectedTax) > items.length) {
    throw new ZohoError("REMOTE_TAX_MISMATCH_REVIEW_REQUIRED");
  }
  await booksClient(connection, "PUT", `salesorders/${remote.salesorder_id}/address/billing`, { data: zohoAddress(order.billing_address_snapshot) });
  await booksClient(connection, "PUT", `salesorders/${remote.salesorder_id}/address/shipping`, { data: zohoAddress(order.shipping_address_snapshot) });
  return remote;
};

export const validateTaxMappings = async (connection, items) => {
  const entries = connection.tax_map instanceof Map ? [...connection.tax_map.entries()] : Object.entries(connection.tax_map || {});
  const required = new Set(items.map(item => `${item.igst > 0 ? "inter" : "intra"}:${item.tax_rate}`));
  for (const [key, taxId] of entries.filter(([key]) => required.has(key) || key === "cod:0")) {
    let tax;
    try { tax = (await booksClient(connection, "GET", `settings/taxes/${taxId}`)).tax; }
    catch (error) {
      if (error.retryable || !/^ZOHO_HTTP_(400|404)_/.test(error.code || "")) throw error;
      tax = (await booksClient(connection, "GET", `settings/taxgroups/${taxId}`)).tax_group;
    }
    const rate = Number(key.split(":")[1]);
    if (!tax || Number(tax.tax_percentage ?? tax.tax_group_percentage) !== rate) throw new ZohoError("TAX_RATE_MAPPING_MISMATCH_REVIEW_REQUIRED");
    if (rate > 0) {
      const components = tax.taxes || [tax];
      const types = [];
      for (const component of components) {
        const details = component.tax_specific_type ? component :
          (await booksClient(connection, "GET", `settings/taxes/${component.tax_id}`)).tax;
        types.push(String(details?.tax_specific_type || "").toLowerCase());
      }
      if (key.startsWith("inter:") ? !types.includes("igst") : !types.includes("cgst") || !(types.includes("sgst") || types.includes("utgst"))) {
        throw new ZohoError("GST_COMPONENT_MAPPING_MISMATCH_REVIEW_REQUIRED");
      }
    }
  }
};
