import { describe, expect, it } from "vitest";
import { validateCapturedPayment } from "./finalizeCapturedPayment.js";

const order = {
  grand_total: 123.45,
  currency: "INR",
  payment_meta: { razorpay_order_id: "order_gateway_1" },
};
const payment = {
  id: "pay_1",
  order_id: "order_gateway_1",
  status: "captured",
  amount: 12345,
  currency: "INR",
};

describe("validateCapturedPayment", () => {
  it("accepts an exact captured payment", () => {
    expect(() => validateCapturedPayment(order, payment)).not.toThrow();
  });

  it.each([
    ["provider order", { order_id: "order_other" }],
    ["amount", { amount: 12344 }],
    ["currency", { currency: "USD" }],
    ["status", { status: "authorized" }],
  ])("rejects a %s mismatch", (_label, change) => {
    expect(() => validateCapturedPayment(order, { ...payment, ...change })).toThrow(
      "Captured payment does not match this order",
    );
  });
});
