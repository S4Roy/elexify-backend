import { describe, expect, it } from "vitest";
import { assertOrderEligible } from "./ZohoSalesOrderService.js";

const order = () => ({ zoho: { packed_at: new Date() }, order_status: "packed", payment_method: "cod", payment_status: "pending" });

describe("packed-order accounting eligibility", () => {
  it("does not export a confirmed order before its first PACKED event", () => {
    const input = order(); input.zoho = {};
    expect(() => assertOrderEligible(input)).toThrow("ORDER_NOT_PACKED");
  });
  it("allows a committed package to sync before Shiprocket changes the parent status", () => {
    const input = order(); input.order_status = "confirmed";
    expect(() => assertOrderEligible(input)).not.toThrow();
  });
  it("allows packed COD without pretending the payment is collected", () => {
    expect(() => assertOrderEligible(order())).not.toThrow();
  });
  it("requires payment/advance capture for prepaid and partial COD", () => {
    const input = order(); input.payment_method = "razorpay";
    expect(() => assertOrderEligible(input)).toThrow("ORDER_PAYMENT_NOT_CONFIRMED");
    input.payment_method = "cod"; input.is_partial_cod = true;
    expect(() => assertOrderEligible(input)).toThrow("ORDER_PAYMENT_NOT_CONFIRMED");
    input.payment_status = "advance_paid";
    expect(() => assertOrderEligible(input)).not.toThrow();
  });
  it.each(["cancelled", "returned", "return_requested", "failed"])("requires review for %s", status => {
    const input = order(); input.order_status = status;
    expect(() => assertOrderEligible(input)).toThrow("ORDER_LIFECYCLE_REVIEW_REQUIRED");
  });
  it("does not overwrite accounting after refunds", () => {
    const input = order(); input.payment_status = "partially_refunded";
    expect(() => assertOrderEligible(input)).toThrow("ORDER_LIFECYCLE_REVIEW_REQUIRED");
  });
});
