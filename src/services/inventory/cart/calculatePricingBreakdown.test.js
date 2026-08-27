import { describe, expect, it } from "vitest";
import { calculatePricingBreakdown } from "./calculatePricingBreakdown.js";

describe("calculatePricingBreakdown", () => {
  it("separates product and quantity discounts without double counting", () => {
    const result = calculatePricingBreakdown([
      {
        quantity: 2,
        price: 1000,
        discounted_price: 720,
        discount_percent: 10,
      },
    ]);

    expect(result).toEqual({
      mrp_subtotal: 2000,
      net_product_amount: 1440,
      product_discount: 400,
      quantity_discount: 160,
      total_discount: 560,
    });
  });

  it("applies currency conversion to every displayed amount", () => {
    const result = calculatePricingBreakdown(
      [{ quantity: 1, price: 500, discounted_price: 400 }],
      2,
    );

    expect(result.mrp_subtotal).toBe(1000);
    expect(result.net_product_amount).toBe(800);
    expect(result.total_discount).toBe(200);
  });
});
