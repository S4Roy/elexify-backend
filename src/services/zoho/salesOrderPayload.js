import { ZohoError } from "./ZohoBooksClient.js";

const money = value => Math.round(Number(value) * 100);
export const salesOrderPayload = ({ order, items, customerId, itemIds, connection, packages }) => {
  if (!items.length || order.currency !== connection.currency) throw new ZohoError("ORDER_CURRENCY_OR_ITEMS_INVALID");
  const lineItems = [];
  let total = 0;
  let couponTotal = 0;
  let shippingTotal = 0;
  for (const item of items) {
    if (!item.sku || !item.product_name || !(item.quantity > 0) || !Number.isFinite(item.tax_rate) ||
        !Number.isFinite(item.final_line_total) || !(item.final_line_total > 0)) throw new ZohoError("ORDER_FINANCIAL_SNAPSHOT_REQUIRED");
    const shipping = Number(item.shipping_allocation || 0);
    const coupon = Number(item.coupon_discount || 0);
    if (![item.quantity, item.total_price, item.taxable_amount, item.tax_amount, item.tax_rate, shipping, coupon].every(value => Number.isFinite(value) && value >= 0) ||
        coupon > item.total_price || !itemIds.get(String(item._id))) throw new ZohoError("ORDER_FINANCIAL_SNAPSHOT_INCONSISTENT");
    if (money(item.total_price - coupon + shipping) !== money(item.final_line_total) ||
        Math.abs(money(item.taxable_amount + item.tax_amount) - money(item.final_line_total)) > 1) throw new ZohoError("ORDER_FINANCIAL_SNAPSHOT_INCONSISTENT");
    if (Math.abs(money(item.final_line_total / (1 + item.tax_rate / 100)) - money(item.taxable_amount)) > 1 ||
        Math.abs(money((item.cgst || 0) + (item.sgst || 0) + (item.igst || 0)) - money(item.tax_amount)) > 1) {
      throw new ZohoError("ORDER_TAX_SNAPSHOT_INCONSISTENT");
    }
    const taxKey = `${item.igst > 0 ? "inter" : "intra"}:${item.tax_rate}`;
    const taxId = connection.tax_map?.get ? connection.tax_map.get(taxKey) : connection.tax_map?.[taxKey];
    if (!taxId) throw new ZohoError("ORDER_TAX_MAPPING_REQUIRED");
    lineItems.push({ item_id: itemIds.get(String(item._id)), name: [item.product_name, item.variation_name].filter(Boolean).join(" - "),
      description: `SKU: ${item.sku}`, quantity: item.quantity, rate: Number((item.total_price / item.quantity).toFixed(8)),
      discount: item.total_price > 0 ? `${(coupon / item.total_price * 100).toFixed(8)}%` : "0%", tax_id: taxId });
    if (shipping) lineItems.push({ name: "Shipping", description: `Shipping allocation: ${item.sku}`, quantity: 1, rate: shipping, tax_id: taxId });
    total += money(item.final_line_total);
    couponTotal += money(coupon);
    shippingTotal += money(shipping);
  }
  if (order.cod_fee) {
    const taxId = connection.tax_map?.get ? connection.tax_map.get("cod:0") : connection.tax_map?.["cod:0"];
    if (!taxId) throw new ZohoError("COD_TAX_MAPPING_REQUIRED");
    lineItems.push({ name: "COD handling", quantity: 1, rate: order.cod_fee, tax_id: taxId });
    total += money(order.cod_fee);
  }
  if (total !== money(order.grand_total)) throw new ZohoError("ORDER_TOTAL_MISMATCH_REVIEW_REQUIRED");
  if (couponTotal !== money(order.discount || 0) || shippingTotal !== money(order.shipping || 0)) throw new ZohoError("ORDER_ALLOCATION_MISMATCH_REVIEW_REQUIRED");
  return { customer_id: customerId, reference_number: order.id,
    ...(order.billing_address_snapshot?.gstin ? { gst_no: order.billing_address_snapshot.gstin, gst_treatment: "business_gst" } : {}),
    date: new Date(order.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    line_items: lineItems, is_inclusive_tax: true, discount_type: "item_level", is_discount_before_tax: true,
    notes: [`Elexify order ${order.id}`, `Payment: ${order.payment_method}; status: ${order.payment_status}`,
      `Advance: ${order.advance_amount || 0}; COD due: ${order.cod_due_amount || 0}`,
      `Coupon: ${order.coupon_code || "none"}`,
      `Packages: ${packages.map(pkg => `${pkg.reference_id || pkg.package_number} (${pkg.status})`).join(", ")}`].join("\n"),
  };
};
