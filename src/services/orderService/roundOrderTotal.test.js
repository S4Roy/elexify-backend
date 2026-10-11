import { describe, expect, it } from "vitest";
import { roundAdvance, roundOrderTotal } from "./roundOrderTotal.js";

describe("roundOrderTotal", () => {
  it.each([
    [1234.49, 1234, -0.49],
    [1234.5, 1235, 0.5],
    [1234.01, 1234, -0.01],
    [1234.99, 1235, 0.01],
    [1234, 1234, 0],
    [0.3, 0, -0.3],
  ])("rounds INR %s to %s (round off %s)", (exact, total, roundOff) => {
    expect(roundOrderTotal(exact, "INR")).toEqual({ total, round_off: roundOff });
  });

  it("avoids floating-point drift and leaves other currencies in cents", () => {
    expect(roundOrderTotal(0.1 + 0.2 + 1000.2, "INR")).toEqual({ total: 1001, round_off: 0.5 });
    expect(roundOrderTotal(19.995, "USD")).toEqual({ total: 20, round_off: 0 });
    expect(roundOrderTotal(19.49, "USD")).toEqual({ total: 19.49, round_off: 0 });
  });
});

describe("roundAdvance", () => {
  it("is whole rupees for INR so the COD balance is too", () => {
    expect(roundAdvance(1235, 20, "INR")).toBe(247);
    expect(roundAdvance(1233, 20, "INR")).toBe(247); // 246.6
    expect(roundAdvance(1233, 20, "USD")).toBe(246.6);
  });
});
