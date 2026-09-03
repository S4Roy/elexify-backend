import { describe, expect, it } from "vitest";
import { getCancellationEligibility, getCustomerOrderCapabilities } from "./orderPolicy.js";

const policy = {
  customer_cancellation_enabled: true,
  customer_cancellation_statuses: ["pending", "confirmed", "processing", "packed"],
  customer_cancel_packed_before_dispatch: true,
  admin_cancellation_enabled: true,
  admin_cancellation_statuses: ["pending", "confirmed", "processing", "packed"],
  returns_enabled: true,
  return_window_days: 7,
  return_require_images: true,
  return_reasons: ["Damaged item"],
};

describe("order policy", () => {
  it("allows a configured customer status", () => {
    expect(getCancellationEligibility({ order_status: "processing" }, "customer", policy).allowed).toBe(true);
  });

  it("denies customer cancellation when disabled", () => {
    const result = getCancellationEligibility(
      { order_status: "pending" },
      "customer",
      { ...policy, customer_cancellation_enabled: false },
    );
    expect(result).toEqual({ allowed: false, reason: "Cancellation is disabled by policy." });
  });

  it("denies packed cancellation after courier handover", () => {
    const result = getCancellationEligibility(
      { order_status: "packed", awb: "AWB-1" },
      "customer",
      policy,
    );
    expect(result.allowed).toBe(false);
  });

  it("returns customer-facing policy capabilities", () => {
    expect(getCustomerOrderCapabilities({ order_status: "delivered" }, policy)).toMatchObject({
      cancellation: { allowed: false },
      returns: { enabled: true, window_days: 7, require_images: true },
    });
  });
});
