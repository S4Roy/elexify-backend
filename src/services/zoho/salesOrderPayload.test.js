import { describe, expect, it } from "vitest";
import { salesOrderPayload } from "./salesOrderPayload.js";

const fixture = () => ({
  order: { id: "ORD-1", currency: "INR", created_at: "2026-09-20T00:00:00Z", grand_total: 118, discount: 10, shipping: 10, payment_method: "cod", payment_status: "pending" },
  items: [{ _id: "local-item", sku: "SKU-1", product_name: "Product", quantity: 2, total_price: 118, coupon_discount: 10,
    shipping_allocation: 10, final_line_total: 118, taxable_amount: 100, tax_amount: 18, tax_rate: 18, cgst: 9, sgst: 9, igst: 0 }],
  itemIds: new Map([["local-item", "12345"]]), customerId: "45678",
  connection: { currency: "INR", tax_map: { "intra:18": "tax-18" } },
  packages: [{ reference_id: "ORD-1-P1", status: "packed" }],
});

describe("Zoho Sales Order financial snapshots", () => {
  it("splits already-allocated shipping exactly once and preserves coupon discounts", () => {
    const result = salesOrderPayload(fixture());
    expect(result).toMatchObject({ reference_number: "ORD-1", date: "2026-09-20", is_inclusive_tax: true, customer_id: "45678" });
    expect(result.line_items[0]).toMatchObject({ item_id: "12345", quantity: 2, rate: 59, tax_id: "tax-18" });
    expect(parseFloat(result.line_items[0].discount)).toBeCloseTo(10 / 118 * 100);
    expect(result.line_items[1]).toMatchObject({ name: "Shipping", rate: 10, quantity: 1, tax_id: "tax-18" });
    expect(result).not.toHaveProperty("shipping_charge");
  });
  it("does not duplicate quantities or charges for additional packages", () => {
    const input = fixture();
    const first = salesOrderPayload(input);
    input.packages.push({ reference_id: "ORD-1-P2", status: "packed" });
    const second = salesOrderPayload(input);
    expect(second.line_items).toEqual(first.line_items);
    expect(second.reference_number).toBe(first.reference_number);
    expect(second.notes).toContain("ORD-1-P2");
  });
  it("fails closed on missing tax configuration", () => {
    const input = fixture(); input.connection.tax_map = {};
    expect(() => salesOrderPayload(input)).toThrow("ORDER_TAX_MAPPING_REQUIRED");
  });
  it("rejects inconsistent order totals", () => {
    const input = fixture(); input.order.grand_total = 128;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_TOTAL_MISMATCH");
  });
  it("rejects missing historical financials instead of using current catalog prices", () => {
    const input = fixture(); input.items[0].final_line_total = 0;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_FINANCIAL_SNAPSHOT_REQUIRED");
  });
  it("rejects an unsupported currency", () => {
    const input = fixture(); input.order.currency = "USD";
    expect(() => salesOrderPayload(input)).toThrow("ORDER_CURRENCY_OR_ITEMS_INVALID");
  });
  it("rejects incomplete or negative financial values", () => {
    const input = fixture(); input.items[0].tax_amount = undefined;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_FINANCIAL_SNAPSHOT_INCONSISTENT");
    input.items[0].tax_amount = -18;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_FINANCIAL_SNAPSHOT_INCONSISTENT");
  });
  it("does not accept a tax rate inconsistent with captured tax", () => {
    const input = fixture(); input.items[0].tax_rate = 0;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_TAX_SNAPSHOT_INCONSISTENT");
  });
  it("checks order-level allocations independently of the grand total", () => {
    const input = fixture(); input.order.shipping = 20;
    expect(() => salesOrderPayload(input)).toThrow("ORDER_ALLOCATION_MISMATCH_REVIEW_REQUIRED");
  });
});
