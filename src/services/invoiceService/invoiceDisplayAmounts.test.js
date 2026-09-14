import { describe, expect, it } from "vitest";
import { invoiceDisplayAmounts } from "./invoiceDisplayAmounts.js";

describe("invoice display arithmetic", () => {
  it("reconciles the reported invoice without deducting discounts or adding shipping twice", () => {
    const invoice = { items: [
      { quantity: 1, unit_price: 10, discount: 9, shipping_allocation: 1.93, total: 11.93 },
      { quantity: 1, unit_price: 249, discount: 250, shipping_allocation: 48.07, total: 297.07 },
    ] };
    const original = structuredClone(invoice);
    const result = invoiceDisplayAmounts(invoice);
    expect(result.items.map((item) => item.unit_price)).toEqual([19, 499]);
    expect(result.items.map((item) => item.total)).toEqual([10, 249]);
    expect(result.subtotal).toBe(518);
    expect(result.subtotal - 259 + 50).toBe(309);
    expect(invoice).toEqual(original);
  });

  it("handles quantities, product discounts, coupons and inclusive tax", () => {
    const result = invoiceDisplayAmounts({ items: [
      { quantity: 2, discount: 30, shipping_allocation: 4, total: 194 },
      { quantity: 1, discount: 10, shipping_allocation: 6, total: 101 },
    ] });
    expect(result.items.map((item) => item.unit_price)).toEqual([110, 105]);
    expect(result.subtotal).toBe(325);
    expect(result.subtotal - 25 - 15 + 10).toBe(295);
  });

  it("supports legacy lines without shipping allocations and order-level coupons", () => {
    const result = invoiceDisplayAmounts({ items: [
      { quantity: 2, discount: 20, total: 200 },
    ] });
    expect(result.items[0].unit_price).toBe(110);
    expect(result.subtotal - 20 - 10 + 50 + 15).toBe(255);
  });

  it("preserves free merchandise and fractional unit rates", () => {
    const result = invoiceDisplayAmounts({ items: [
      { quantity: 3, discount: 10, total: 0 },
    ] });
    expect(result.subtotal).toBe(10);
    expect(result.items[0].total).toBe(0);
  });
});
