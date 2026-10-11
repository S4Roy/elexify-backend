import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { transitionOrder } from "../transitionOrder.js";
import { sendOrderNotification } from "../../notification/sendOrderNotification.js";
import { codAmountDue, dispatchManual, markManualDelivered, recordFailedAttempt, returnToStore } from "./manualFulfillment.js";

vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("../../../models/OrderItem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../../models/Package.js", () => ({
  default: { find: vi.fn(), findById: vi.fn(), create: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("./recomputeOrderStatus.js", () => ({ recomputeOrderStatus: vi.fn() }));
vi.mock("../transitionOrder.js", () => ({ transitionOrder: vi.fn() }));
vi.mock("../../notification/sendOrderNotification.js", () => ({ sendOrderNotification: vi.fn() }));
vi.mock("./applyShiprocketShipment.js", () => ({
  fulfillmentBlocked: (o) => ["cancelled", "returned", "return_requested"].includes(o.order_status) || !!o.inventory_reverted,
}));

// Mongoose queries in the service are chained with .session(session).
const q = (value) => ({ session: vi.fn().mockResolvedValue(value) });
const ORDER_ID = "507f1f77bcf86cd799439011";
const PKG_ID = "507f1f77bcf86cd799439022";
const ADMIN = "507f1f77bcf86cd799439033";

const order = (over = {}) => ({
  _id: ORDER_ID, id: "ORD-1", order_status: "processing", payment_method: "cod", payment_status: "pending",
  is_partial_cod: false, grand_total: 1200, cod_due_amount: 0, currency: "INR", ...over,
});
const manualPkg = (over = {}) => ({
  _id: PKG_ID, order_id: ORDER_ID, status: "out_for_delivery", fulfillment_mode: "self_delivery",
  shipped_at: new Date(Date.now() - 3600_000), delivery_agent: { name: "Ravi" }, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(mongoose, "startSession").mockResolvedValue({
    withTransaction: async (fn) => fn(),
    endSession: vi.fn(),
  });
});

describe("codAmountDue", () => {
  it("is the grand total for full COD, the balance for Partial COD, zero when prepaid", () => {
    expect(codAmountDue(order())).toBe(1200);
    expect(codAmountDue(order({ is_partial_cod: true, payment_status: "advance_paid", cod_due_amount: 900 }))).toBe(900);
    expect(codAmountDue(order({ payment_method: "razorpay", payment_status: "paid" }))).toBe(0);
  });
});

describe("dispatchManual", () => {
  const setup = (o, packages = []) => {
    Order.findOne.mockReturnValue(q(o));
    OrderItem.find.mockReturnValue(q([{ _id: "item1", quantity: 2 }]));
    Package.find.mockReturnValue(q(packages));
    Package.create.mockImplementation(async ([doc]) => [{ _id: PKG_ID, ...doc }]);
  };
  const args = (mode) => ({ orderId: ORDER_ID, mode, agent: { name: "Ravi", phone: "9876543210" }, reason: "Local delivery", adminId: ADMIN });

  it("puts a self delivery package out for delivery and notifies the customer", async () => {
    setup(order());
    recomputeOrderStatus.mockResolvedValue({ order: order({ order_status: "out_for_delivery" }) });
    await dispatchManual(args("self_delivery"));
    const [[doc]] = Package.create.mock.calls[0];
    expect(doc).toMatchObject({
      status: "out_for_delivery", fulfillment_mode: "self_delivery", integration_status: "not_applicable",
      reference_id: "ORD-1-P1", items: [{ order_item_id: "item1", quantity: 2 }],
    });
    expect(doc.shiprocket_order_id).toBeUndefined();
    expect(sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "ORDER_OUT_FOR_DELIVERY" }));
  });

  it("marks a store pickup package ready for pickup", async () => {
    setup(order());
    recomputeOrderStatus.mockResolvedValue({ order: order({ order_status: "packed" }) });
    await dispatchManual(args("store_pickup"));
    expect(Package.create.mock.calls[0][0][0]).toMatchObject({ status: "packed", shipped_at: null });
    expect(sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "ORDER_READY_FOR_PICKUP" }));
  });

  it.each([
    ["an unpaid prepaid order", order({ payment_method: "razorpay", payment_status: "pending", order_status: "confirmed" }), [], /Record the received payment/],
    ["a refunded/reverted order", order({ inventory_reverted: true }), [], /cancellation, return, or refund/],
    ["an order that already has packages", order(), [{ status: "packed", package_number: 1 }], /already has packages/],
    ["a pending order", order({ order_status: "pending" }), [], /Cannot dispatch/],
  ])("rejects %s", async (_, o, packages, message) => {
    setup(o, packages);
    await expect(dispatchManual(args("self_delivery"))).rejects.toThrow(message);
    expect(Package.create).not.toHaveBeenCalled();
  });
});

describe("markManualDelivered", () => {
  const setup = (o, pkg = manualPkg()) => {
    Package.findById.mockReturnValue(q(pkg));
    Order.findOne.mockReturnValue(q(o));
    recomputeOrderStatus.mockResolvedValue({ order: { ...o, order_status: "delivered", shipped_at: pkg.shipped_at } });
    Order.findById.mockReturnValue(q({ ...o, order_status: "delivered", payment_status: "paid" }));
  };
  const deliveredAt = new Date(Date.now() - 600_000);
  const base = { packageId: PKG_ID, deliveredAt, receiverName: "Asha", adminId: ADMIN };

  it("records COD cash, settles payment and keeps the real handover time", async () => {
    setup(order());
    await markManualDelivered({ ...base, codCollection: { amount: 1200, method: "cash" } });
    expect(Package.updateOne.mock.calls[0][1].$set).toMatchObject({
      status: "delivered", delivered_at: deliveredAt,
      proof_of_delivery: expect.objectContaining({ receiver_name: "Asha", delivered_at: deliveredAt }),
    });
    expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({
      paymentStatus: "paid",
      set: expect.objectContaining({
        delivered_at: deliveredAt, paid_at: deliveredAt,
        cod_collection: expect.objectContaining({ amount: 1200, method: "cash", collected_by: "Ravi" }),
      }),
    }));
    expect(sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "ORDER_DELIVERED" }));
  });

  it("settles only the balance for Partial COD", async () => {
    setup(order({ is_partial_cod: true, payment_status: "advance_paid", cod_due_amount: 900 }));
    await expect(markManualDelivered({ ...base, codCollection: { amount: 1200, method: "cash" } })).rejects.toThrow(/amount due \(900\)/);
    await markManualDelivered({ ...base, codCollection: { amount: 900, method: "upi", reference: "UPI123" } });
    expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "paid" }));
  });

  it("does not touch payment for a prepaid order", async () => {
    setup(order({ payment_method: "razorpay", payment_status: "paid" }));
    await markManualDelivered(base);
    expect(transitionOrder).not.toHaveBeenCalled();
    expect(Order.updateOne).toHaveBeenCalledWith({ _id: ORDER_ID }, { $set: expect.objectContaining({ delivered_at: deliveredAt }) }, expect.anything());
  });

  it.each([
    ["missing COD collection", order(), manualPkg(), {}, /Record the INR 1200/],
    ["UPI without a reference", order(), manualPkg(), { codCollection: { amount: 1200, method: "upi" } }, /UPI reference/],
    ["a Shiprocket package", order(), manualPkg({ fulfillment_mode: "shiprocket" }), {}, /Shiprocket tracking/],
    ["an already delivered package", order(), manualPkg({ status: "delivered" }), {}, /package is "delivered"/],
    ["a handover before dispatch", order(), manualPkg({ shipped_at: new Date() }), { codCollection: { amount: 1200, method: "cash" } }, /before the package was dispatched/],
  ])("rejects %s", async (_, o, pkg, extra, message) => {
    setup(o, pkg);
    await expect(markManualDelivered({ ...base, ...extra })).rejects.toThrow(message);
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("rejects a future delivery time", async () => {
    await expect(markManualDelivered({ ...base, deliveredAt: new Date(Date.now() + 3600_000) })).rejects.toThrow(/not in the future/);
  });
});

describe("failed attempts and return to store", () => {
  it("logs a failed attempt without changing the package status", async () => {
    Package.findById.mockReturnValue(q(manualPkg()));
    Order.findOne.mockReturnValue(q(order({ order_status: "out_for_delivery" })));
    Package.findOneAndUpdate.mockResolvedValue({ delivery_attempts: [{}] });
    await recordFailedAttempt({ packageId: PKG_ID, reason: "Customer not home", adminId: ADMIN });
    const update = Package.findOneAndUpdate.mock.calls[0][1];
    expect(update.$push.delivery_attempts).toMatchObject({ reason: "Customer not home" });
    expect(update.$set).toBeUndefined();
  });

  it("cancels the package and rolls the order back to processing", async () => {
    Package.findById.mockReturnValue(q(manualPkg()));
    Order.findOne.mockReturnValue(q(order({ order_status: "out_for_delivery" })));
    Package.countDocuments.mockReturnValue(q(1));
    Order.findOneAndUpdate.mockResolvedValue(order({ order_status: "processing" }));
    recomputeOrderStatus.mockResolvedValue({ order: order({ order_status: "processing" }) });
    const { order: result } = await returnToStore({ packageId: PKG_ID, reason: "Customer unreachable", adminId: ADMIN });
    expect(Package.updateOne.mock.calls[0][1].$set).toMatchObject({ status: "cancelled" });
    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ORDER_ID, order_status: "out_for_delivery" },
      expect.objectContaining({ $set: expect.objectContaining({ order_status: "processing", shipped_at: null }) }),
      expect.anything(),
    );
    expect(result.order_status).toBe("processing");
  });
});
