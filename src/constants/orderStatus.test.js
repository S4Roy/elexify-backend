import { describe, expect, it } from "vitest";
import { canTransitionOrder } from "./orderStatus.js";
import { canTransitionPayment } from "../services/orderService/transitionOrder.js";

describe("order status transitions", () => {
  it("allows the normal fulfilment path", () => {
    expect(canTransitionOrder("pending", "confirmed")).toBe(true);
    expect(canTransitionOrder("processing", "shipped")).toBe(true);
    expect(canTransitionOrder("out_for_delivery", "delivered")).toBe(true);
  });

  it("rejects backwards and logically invalid transitions", () => {
    expect(canTransitionOrder("delivered", "pending")).toBe(false);
    expect(canTransitionOrder("shipped", "cancelled")).toBe(false);
  });

  it("rejects invalid payment transitions", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
  });
});
