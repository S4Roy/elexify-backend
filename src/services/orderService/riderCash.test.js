import { describe, expect, it, vi } from "vitest";
import { pendingRiderCash, receiveRiderCash } from "./riderCash.js";

vi.mock("../../models/Order.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../models/CashHandover.js", () => ({ default: {} }));

const ID = "507f1f77bcf86cd799439011";

describe("receiveRiderCash input checks", () => {
  it.each([
    ["no orders", { orderIds: [], amountReceived: 100, riderUserId: ID }, /Select the orders/],
    ["a bad order id", { orderIds: ["x"], amountReceived: 100, riderUserId: ID }, /Invalid order/],
    ["a negative amount", { orderIds: [ID], amountReceived: -1, riderUserId: ID }, /amount received/],
  ])("rejects %s", async (_, args, message) => {
    await expect(receiveRiderCash({ ...args, adminId: ID })).rejects.toThrow(message);
  });
});

describe("pendingRiderCash", () => {
  it("needs a rider account or name", async () => {
    await expect(pendingRiderCash({})).rejects.toThrow(/Choose a rider/);
    await expect(pendingRiderCash({ riderUserId: "nope" })).rejects.toThrow(/Invalid rider/);
  });
});
