import { describe, expect, it } from "vitest";
import { computeGst } from "./computeGst.js";

const company = { gstin: "19ABCDE1234F1Z5", gstRate: 18, state: "West Bengal" };

describe("computeGst state normalization", () => {
  it("uses split GST for matching state names", () => {
    const result = computeGst({ grandTotal: 118, shippingState: " west bengal ", company });
    expect(result).toMatchObject({ taxableAmount: 100, taxAmount: 18, cgst: 9, sgst: 9, igst: 0 });
  });
  it("does not crash on numeric state IDs and treats them as interstate without a name match", () => {
    const result = computeGst({ grandTotal: 118, shippingState: 19, company });
    expect(result).toMatchObject({ cgst: 0, sgst: 0, igst: 18 });
  });
});
