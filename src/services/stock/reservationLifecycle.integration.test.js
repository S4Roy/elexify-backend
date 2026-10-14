import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { errors } from "celebrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../paymentService/createRazorpayOrder.js", () => ({
  createRazorpayOrder: vi.fn(async (amount, currency, receipt) => {
    provider.calls += 1;
    return { id: `order_stub_${provider.calls}`, amount: Math.round(amount * 100), currency: String(currency).toUpperCase(), receipt };
  }),
  findRazorpayOrderByReceipt: vi.fn(async () => null),
}));

import { handleError } from "../../config/handleErrors.js";
import { add } from "../../controllers/site/inventory/order/add.js";
import { place } from "../../validations/site/inventory/order/place.js";
import Address from "../../models/Address.js";
import Cart from "../../models/Cart.js";
import Order from "../../models/Order.js";
import Pincode from "../../models/Pincode.js";
import Product from "../../models/Product.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import ShippingSettings from "../../models/ShippingSettings.js";
import StockReservation from "../../models/StockReservation.js";
import StockTransaction from "../../models/StockTransaction.js";
import User from "../../models/User.js";
import { finalizeCapturedPayment } from "../orderService/finalizeCapturedPayment.js";
import { cancelOrder } from "../orderService/cancelOrder.js";
import { releaseExpiredReservations } from "./expiry.js";
import { renewReservation, withStockTransaction } from "./mutations.js";

// Prepaid checkout holds stock at placement, so two buyers can't both pay
// for the last unit; the hold is committed on capture, released on expiry,
// and a capture that lands after release either re-sells or is refunded.
const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_stock_reservation_integration$1");
const suite = uri ? describe : describe.skip;

suite("prepaid stock reservation lifecycle", () => {
  let app;
  let users;
  let addresses;
  let product;

  const place_ = (i, key) => request(app)
    .post("/order/place")
    .set("x-test-user-id", String(users[i]._id))
    .send({ currency: "INR", address_id: String(addresses[i]._id), payment_method: "razorpay", idempotency_key: `reserve-${key}-00000001` });
  const sku = () => Product.findById(product._id).lean();
  const capture = (order, id = "pay_ok") => finalizeCapturedPayment({
    orderId: order.id,
    source: "integration",
    paymentData: {
      id, order_id: order.payment_meta.razorpay_order_id, status: "captured",
      amount: Math.round(order.grand_total * 100), currency: order.currency, method: "upi",
    },
  });
  const expireHolds = () => StockReservation.updateMany({}, { $set: { expires_at: new Date(Date.now() - 1000) } });

  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: false });
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.__ = (message) => message;
      req.auth = { user_id: req.get("x-test-user-id") };
      next();
    });
    app.post("/order/place", place, add);
    app.use(errors());
    app.use(handleError);
  });

  beforeEach(async () => {
    provider.calls = 0;
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      Order.syncIndexes(), ProviderOrderAttempt.syncIndexes(),
      StockTransaction.syncIndexes(), StockReservation.syncIndexes(),
    ]);
    users = await User.create([0, 1].map((i) => ({
      role: "customer", name: ["Reserve Alice", "Reserve Bob"][i], email: `reserve-${i}@example.test`, status: "active",
      mobile: `987654321${i}`, phone_code: "91", mobile_verified_at: new Date(),
    })));
    addresses = await Address.create(users.map((u, i) => ({
      user: u._id, full_name: ["Reserve Alice", "Reserve Bob"][i], phone: `987654321${i}`,
      address_line_1: `${i} Reserve Street`, state: 19, country: 101, postcode: "700001",
    })));
    product = await Product.create({ name: "Last Unit", slug: "last-unit", sku: "LAST-1", regular_price: 100, stock_quantity: 1, status: "active", cod_status: "allowed" });
    await Cart.create(users.map((u) => ({ user: u._id, product: product._id, quantity: 1, price: 100 })));
    await Pincode.create({ pincode: "700001", status: "active", cod_status: "allowed" });
    await ShippingSettings.create({ cod_enabled: true, cod_charge_enabled: false });
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("holds the last unit for exactly one prepaid checkout, before payment", async () => {
    const [a, b] = await Promise.all([place_(0, "race-a"), place_(1, "race-b")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.message).toMatch(/OUT_OF_STOCK/);

    const doc = await sku();
    expect([doc.stock_quantity, doc.reserved_quantity, doc.stock_status]).toEqual([1, 1, "out_of_stock"]);
    expect(await StockTransaction.countDocuments()).toBe(0);
    const order = await Order.findOne();
    expect(order.stock_state).toBe("reserved");
    expect(order.reservation_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("commits the hold on capture", async () => {
    expect((await place_(0, "commit")).status).toBe(200);
    const result = await capture(await Order.findOne());
    expect(result.order.stock_state).toBe("committed");
    const doc = await sku();
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([0, 0]);
    expect(await StockTransaction.findOne({ type: "sale" }).lean()).toMatchObject({ delta: -1, balance_after: 0 });
  });

  it("releases an expired hold, and a later capture re-sells if stock remains", async () => {
    expect((await place_(0, "expire")).status).toBe(200);
    await expireHolds();
    const summary = await releaseExpiredReservations({ fetchPayments: async () => [] });
    expect(summary.released).toBe(1);
    expect((await sku()).reserved_quantity).toBe(0);
    expect((await Order.findOne()).stock_state).toBe("released");

    const result = await capture(await Order.findOne());
    expect(result.outOfStock).toBeUndefined();
    expect((await sku()).stock_quantity).toBe(0);
  });

  it("finalizes instead of releasing when the gateway shows a capture", async () => {
    expect((await place_(0, "gateway")).status).toBe(200);
    const order = await Order.findOne();
    await expireHolds();
    const summary = await releaseExpiredReservations({
      fetchPayments: async () => [{
        id: "pay_late", order_id: order.payment_meta.razorpay_order_id, status: "captured",
        amount: Math.round(order.grand_total * 100), currency: order.currency,
      }],
    });
    expect(summary.finalized).toBe(1);
    expect((await Order.findById(order._id)).stock_state).toBe("committed");
  });

  it("refunds a capture that lands after the hold lapsed and the unit sold", async () => {
    expect((await place_(0, "late-a")).status).toBe(200);
    const late = await Order.findOne({ user: users[0]._id });
    await expireHolds();
    await releaseExpiredReservations({ fetchPayments: async () => [] });

    expect((await place_(1, "late-b")).status).toBe(200);
    await capture(await Order.findOne({ user: users[1]._id }), "pay_b");

    const result = await capture(late, "pay_a");
    expect(result.outOfStock).toBe(true);
    const refunded = await Order.findById(late._id);
    expect(refunded.order_status).toBe("cancelled");
    expect(refunded.stock_flag).toBe("late_capture_oos");
    const doc = await sku();
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([0, 0]);
  });

  it("re-holds stock for a payment retry after the hold lapsed", async () => {
    expect((await place_(0, "retry")).status).toBe(200);
    await expireHolds();
    await releaseExpiredReservations({ fetchPayments: async () => [] });
    const order = await Order.findOne();
    await withStockTransaction((session) => renewReservation({ order, expiresAt: new Date(Date.now() + 60_000), session }));
    expect((await sku()).reserved_quantity).toBe(1);
    const renewed = await Order.findById(order._id);
    expect([renewed.stock_state, renewed.stock_epoch]).toEqual(["reserved", 1]);
  });

  it("refunds a payment that lands after the customer cancelled, without reviving the order", async () => {
    expect((await place_(0, "cancel-then-pay")).status).toBe(200);
    const order = await Order.findOne();
    await cancelOrder({ orderId: String(order._id), actorType: "customer", actorId: users[0]._id, reason: "Changed my mind" });

    const result = await capture(order, "pay_after_cancel");
    expect(result.cancelled).toBe(true);
    const after = await Order.findById(order._id);
    expect(after.order_status).toBe("cancelled");
    expect(after.cancellation.reason).toBe("Changed my mind");
    expect(after.stock_flag).toBe("capture_after_cancel");
    expect(["refund_pending", "refund_failed", "refunded"]).toContain(after.payment_status);
    const doc = await sku();
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([1, 0]);
    expect(await StockTransaction.countDocuments()).toBe(0);
    expect((await capture(order, "pay_after_cancel")).alreadyFinalized).toBe(true);
  });

  it("cancelling an unpaid prepaid order frees its hold without a ledger row", async () => {
    expect((await place_(0, "cancel")).status).toBe(200);
    const order = await Order.findOne();
    await cancelOrder({ orderId: String(order._id), actorType: "customer", actorId: users[0]._id, reason: "Changed my mind" });
    const doc = await sku();
    expect([doc.stock_quantity, doc.reserved_quantity, doc.stock_status]).toEqual([1, 0, "in_stock"]);
    expect(await StockTransaction.countDocuments()).toBe(0);
    expect((await Order.findById(order._id)).stock_state).toBe("released");
  });
});
