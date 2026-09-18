import { describe, expect, it } from "vitest";
import { roundShippingCharge } from "./roundShippingCharge.js";

describe("shipping charge rounding", () => {
  it("rounds the final INR amount to the nearest rupee", () => {
    expect(roundShippingCharge(49.49, "INR")).toBe(49);
    expect(roundShippingCharge(49.5, "INR")).toBe(50);
    expect(roundShippingCharge(0.49, "INR")).toBe(0);
  });

  it("retains cents for other currencies and never charges negative shipping", () => {
    expect(roundShippingCharge(49.495, "USD")).toBe(49.5);
    expect(roundShippingCharge(-2, "INR")).toBe(0);
  });
});
