import { describe, expect, it } from "vitest";
import { getComparisonRange, orderSegmentMatch } from "./orderFilters.js";

describe("dashboard segment filters", () => {
  it("is empty for all channels / all payments and for unknown values", () => {
    expect(orderSegmentMatch({})).toEqual({});
    expect(orderSegmentMatch({ channel: "pos", payment: "crypto" })).toEqual({});
  });
  it("treats legacy orders without a source as storefront orders", () => {
    expect(orderSegmentMatch({ channel: "storefront" })).toEqual({ source: { $in: ["storefront", null] } });
    expect(orderSegmentMatch({ channel: "admin" })).toEqual({ source: "admin" });
  });
  it("separates prepaid, full COD and partial COD", () => {
    expect(orderSegmentMatch({ payment: "prepaid" })).toEqual({ payment_method: "razorpay" });
    expect(orderSegmentMatch({ payment: "cod" })).toEqual({ payment_method: "cod", is_partial_cod: { $ne: true } });
    expect(orderSegmentMatch({ payment: "partial_cod", channel: "admin" })).toEqual({ is_partial_cod: true, source: "admin" });
  });
  it("compares with the preceding window or the same dates last year", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-30T23:59:59.999Z");
    const prev = getComparisonRange(start, end);
    expect(prev.prevEnd.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(prev.prevStart.toISOString()).toBe("2026-08-02T00:00:00.000Z");
    const yoy = getComparisonRange(start, end, "previous_year");
    expect(yoy.prevStart.toISOString()).toBe("2025-09-01T00:00:00.000Z");
    expect(yoy.prevEnd.toISOString()).toBe("2025-09-30T23:59:59.999Z");
  });
});
