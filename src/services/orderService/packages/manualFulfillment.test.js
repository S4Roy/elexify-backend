import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { transitionOrder } from "../transitionOrder.js";
import { sendOrderNotification } from "../../notification/sendOrderNotification.js";
import User from "../../../models/User.js";
import Role from "../../../models/Role.js";
import { newDeliveryOtp, sendDeliveryOtp, verifyDeliveryOtp } from "./deliveryOtp.js";
import { codAmountDue, dispatchManual, markManualDelivered, recordFailedAttempt, returnToStore } from "./manualFulfillment.js";

vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("../../../models/OrderItem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../../models/Package.js", () => ({
  default: { find: vi.fn(), findById: vi.fn(), create: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock("./recomputeOrderStatus.js", () => ({ recomputeOrderStatus: vi.fn() }));
vi.mock("../transitionOrder.js", () => ({ transitionOrder: vi.fn() }));
vi.mock("../../notification/sendOrderNotification.js", () => ({ sendOrderNotification: vi.fn() }));
vi.mock("../../../models/User.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/Role.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("./deliveryOtp.js", () => ({ newDeliveryOtp: vi.fn(), sendDeliveryOtp: vi.fn(), verifyDeliveryOtp: vi.fn() }));
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
  newDeliveryOtp.mockReturnValue({ code: "4821", record: { hash: "h", sent_count: 1, failed_attempts: 0 } });
  sendDeliveryOtp.mockResolvedValue(true);
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
    const { otpSent } = await dispatchManual(args("self_delivery"));
    const [[doc]] = Package.create.mock.calls[0];
    // The code is stored hashed on the package it was generated for and texted after commit.
    expect(String(doc._id)).toBe(String(newDeliveryOtp.mock.calls[0][0]));
    expect(doc.delivery_otp).toEqual({ hash: "h", sent_count: 1, failed_attempts: 0 });
    expect(sendDeliveryOtp).toHaveBeenCalledWith(expect.objectContaining({ mode: "self_delivery", code: "4821" }));
    expect(otpSent).toBe(true);
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

  it("marks the handover OTP-verified only when a code was entered and checked", async () => {
    setup(order({ payment_method: "razorpay", payment_status: "paid" }));
    verifyDeliveryOtp.mockResolvedValue(true);
    await markManualDelivered({ ...base, otp: "4821", riderId: undefined });
    expect(verifyDeliveryOtp).toHaveBeenCalledWith({ packageId: PKG_ID, code: "4821", riderId: null });
    expect(Package.updateOne.mock.calls[0][1].$set.proof_of_delivery.otp_verified).toBe(true);

    vi.clearAllMocks();
    setup(order({ payment_method: "razorpay", payment_status: "paid" }));
    await markManualDelivered(base);
    expect(verifyDeliveryOtp).not.toHaveBeenCalled();
    expect(Package.updateOne.mock.calls[0][1].$set.proof_of_delivery.otp_verified).toBe(false);
  });

  it("does not deliver when the entered code is wrong", async () => {
    setup(order({ payment_method: "razorpay", payment_status: "paid" }));
    verifyDeliveryOtp.mockRejectedValue(new Error("Wrong code. 4 tries left."));
    await expect(markManualDelivered({ ...base, otp: "0000" })).rejects.toThrow(/Wrong code/);
    expect(Package.updateOne).not.toHaveBeenCalled();
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

describe("delivery staff", () => {
  const RIDER = "507f1f77bcf86cd799439044";
  // findOne(...).select(...).session(...).lean()
  const chain = (value) => ({ select: () => ({ session: () => ({ lean: () => Promise.resolve(value) }) }) });

  it("assigns a staff rider and fills name and phone from their account", async () => {
    Order.findOne.mockReturnValue(q(order()));
    OrderItem.find.mockReturnValue(q([{ _id: "item1", quantity: 1 }]));
    Package.find.mockReturnValue(q([]));
    Package.create.mockImplementation(async ([doc]) => [{ _id: PKG_ID, ...doc }]);
    User.findOne.mockReturnValue(chain({ _id: RIDER, name: "Ravi Kumar", mobile: "9876500000", admin_role_id: "role1" }));
    Role.findOne.mockReturnValue(chain({ _id: "role1" }));
    recomputeOrderStatus.mockResolvedValue({ order: order({ order_status: "out_for_delivery" }) });
    await dispatchManual({ orderId: ORDER_ID, mode: "self_delivery", agent: { user_id: RIDER }, reason: "Local run", adminId: ADMIN });
    expect(Package.create.mock.calls[0][0][0].delivery_agent).toEqual({ name: "Ravi Kumar", phone: "9876500000", user_id: RIDER });
  });

  it("refuses an account without the delivery permission", async () => {
    Order.findOne.mockReturnValue(q(order()));
    OrderItem.find.mockReturnValue(q([{ _id: "item1", quantity: 1 }]));
    Package.find.mockReturnValue(q([]));
    User.findOne.mockReturnValue(chain({ _id: RIDER, name: "Clerk", admin_role_id: "role2" }));
    Role.findOne.mockReturnValue(chain(null));
    await expect(dispatchManual({ orderId: ORDER_ID, mode: "self_delivery", agent: { user_id: RIDER }, reason: "Local run", adminId: ADMIN }))
      .rejects.toThrow(/Delivery Staff permission/);
    expect(Package.create).not.toHaveBeenCalled();
  });

  it("lets a rider complete only their own delivery", async () => {
    const mine = manualPkg({ delivery_agent: { name: "Ravi", user_id: RIDER } });
    Package.findById.mockReturnValue(q(mine));
    Order.findOne.mockReturnValue(q(order({ payment_method: "razorpay", payment_status: "paid" })));
    recomputeOrderStatus.mockResolvedValue({ order: order({ order_status: "delivered" }) });
    Order.findById.mockReturnValue(q(order({ order_status: "delivered" })));
    const base = { packageId: PKG_ID, deliveredAt: new Date(Date.now() - 60_000), receiverName: "Asha", adminId: RIDER };
    await expect(markManualDelivered({ ...base, riderId: "507f1f77bcf86cd799439099" })).rejects.toThrow(/Package not found/);
    await markManualDelivered({ ...base, riderId: RIDER, photoKey: "delivery-proof/p/1.jpg" });
    const set = Package.updateOne.mock.calls[0][1].$set;
    expect(set.proof_of_delivery).toMatchObject({ photo_key: "delivery-proof/p/1.jpg" });
    expect(Package.updateOne.mock.calls[0][1].$push.timeline.raw.source).toBe("delivery_staff");
  });

  it("stops riders back-dating a handover beyond 24 hours", async () => {
    await expect(markManualDelivered({ packageId: PKG_ID, deliveredAt: new Date(Date.now() - 25 * 3600_000), receiverName: "Asha",
      adminId: RIDER, riderId: RIDER })).rejects.toThrow(/at most 24 hours/);
  });

  it("refuses another rider's failed attempt", async () => {
    Package.findById.mockReturnValue(q(manualPkg({ delivery_agent: { name: "Ravi", user_id: RIDER } })));
    Order.findOne.mockReturnValue(q(order({ order_status: "out_for_delivery" })));
    await expect(recordFailedAttempt({ packageId: PKG_ID, reason: "Not home", adminId: ADMIN, riderId: "507f1f77bcf86cd799439099" }))
      .rejects.toThrow(/Package not found/);
  });
});
