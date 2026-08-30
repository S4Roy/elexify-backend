import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { errors } from "celebrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ orders: new Map(), createCalls: 0, lookupCalls: 0 }));

vi.mock("../paymentService/createRazorpayOrder.js", () => ({
  createRazorpayOrder: vi.fn(async (amount, currency, receipt) => {
    provider.createCalls += 1;
    const existing = provider.orders.get(receipt);
    if (existing) return existing;
    const order = {
      id: `order_stub_${provider.createCalls}`,
      amount: Math.round(amount * 100),
      currency: String(currency).toUpperCase(),
      receipt,
    };
    provider.orders.set(receipt, order);
    return order;
  }),
  findRazorpayOrderByReceipt: vi.fn(async ({ receipt, amount, currency }) => {
    provider.lookupCalls += 1;
    const order = provider.orders.get(receipt);
    return order && order.amount === Math.round(amount * 100) && order.currency === String(currency).toUpperCase()
      ? order
      : null;
  }),
}));

import { handleError } from "../../config/handleErrors.js";
import { add } from "../../controllers/site/inventory/order/add.js";
import { place } from "../../validations/site/inventory/order/place.js";
import Address from "../../models/Address.js";
import Cart from "../../models/Cart.js";
import Coupon from "../../models/Coupon.js";
import CouponUsage from "../../models/CouponUsage.js";
import Order from "../../models/Order.js";
import Pincode from "../../models/Pincode.js";
import Product from "../../models/Product.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import ShippingSettings from "../../models/ShippingSettings.js";
import StockTransaction from "../../models/StockTransaction.js";
import User from "../../models/User.js";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_provider_http_integration$1");
const suite = uri ? describe : describe.skip;

suite("PROVIDER-BOUNDARY STUBBED: provider-backed real HTTP exactly-once", () => {
  let app;
  let user;
  let address;
  let alternateAddress;
  let product;

  const key = (suffix) => `provider-http-${suffix}-00000001`;
  const body = (idempotencyKey, overrides = {}) => ({
    currency: "INR",
    address_id: String(address._id),
    payment_method: "razorpay",
    coupon_code: "PROVIDER10",
    idempotency_key: idempotencyKey,
    ...overrides,
  });
  const post = (payload, context = "tab-a") => request(app)
    .post("/order/place")
    .set("x-test-user-id", String(user._id))
    .set("x-test-context", context)
    .send(payload);
  const evidence = async () => ({
    orders: await Order.countDocuments(),
    attempts: await ProviderOrderAttempt.countDocuments(),
    createCalls: provider.createCalls,
    lookupCalls: provider.lookupCalls,
    stock: (await Product.findById(product._id).lean()).stock_quantity,
    saleLedger: await StockTransaction.countDocuments({ type: "sale" }),
    couponUsage: await CouponUsage.countDocuments(),
    reconciliation: (await ProviderOrderAttempt.findOne().lean())?.status || null,
  });

  beforeAll(async () => {
    await mongoose.connect(uri, {
      autoIndex: false,
    });
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
    app.locals.orderPlacementFaultInjector = null;
    provider.orders.clear();
    provider.createCalls = 0;
    provider.lookupCalls = 0;
    await mongoose.connection.db.dropDatabase();
    await Promise.all([Order.syncIndexes(), ProviderOrderAttempt.syncIndexes()]);
    user = await User.create({ role: "customer", name: "Provider Customer", email: "provider-http@example.test", status: "active" });
    [address, alternateAddress] = await Address.create([
      { user: user._id, full_name: "Provider Customer", phone: "9876543210", address_line_1: "1 Provider Street", state: 19, country: 101, postcode: "700001" },
      { user: user._id, full_name: "Provider Customer", phone: "9876543210", address_line_1: "2 Provider Street", state: 19, country: 101, postcode: "700001" },
    ]);
    product = await Product.create({ name: "Provider Product", slug: "provider-product", sku: "PROVIDER-1", regular_price: 100, stock_quantity: 5, status: "active", cod_status: "allowed" });
    await Cart.create({ user: user._id, product: product._id, quantity: 1, price: 100 });
    await Coupon.create({
      code: "PROVIDER10", title: "Provider ten percent", discount_type: "percentage", discount_value: 10,
      applicable_for: "user", applicable_scope: "all", usage_per_email: 20,
      start_date: new Date(Date.now() - 86_400_000), end_date: new Date(Date.now() + 86_400_000), status: "active",
    });
    await Pincode.create({ pincode: "700001", status: "active", cod_status: "allowed" });
    await ShippingSettings.create({ cod_enabled: true, cod_charge_enabled: false });
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("converges simultaneous same-key requests on one provider order", async () => {
    const payload = body(key("same"));
    const [a, b] = await Promise.all([post(payload, "tab-a"), post(payload, "tab-b")]);
    expect([a.status, b.status].some((status) => status === 200)).toBe(true);
    expect([a.status, b.status].every((status) => [200, 409, 503].includes(status))).toBe(true);
    const retry = await post(payload, "tab-b-retry");
    expect(retry.status).toBe(200);
    expect(await evidence()).toEqual({ orders: 1, attempts: 1, createCalls: 1, lookupCalls: 0, stock: 5, saleLedger: 0, couponUsage: 0, reconciliation: "linked" });
  });

  it("rejects a changed payload without a second provider call", async () => {
    const idempotencyKey = key("mismatch");
    expect((await post(body(idempotencyKey))).status).toBe(200);
    const conflict = await post(body(idempotencyKey, { address_id: String(alternateAddress._id) }));
    expect(conflict.status).toBe(409);
    expect(provider.createCalls).toBe(1);
    expect(await ProviderOrderAttempt.countDocuments()).toBe(1);
  });

  it("reuses the provider order after a failure following local provider-id persistence", async () => {
    let injected = false;
    app.locals.orderPlacementFaultInjector = async (stage) => {
      if (stage === "before_transaction" && !injected) {
        injected = true;
        throw new Error("simulated lost response after provider persistence");
      }
    };
    const payload = body(key("post-persist-timeout"));
    expect((await post(payload)).status).toBe(500);
    app.locals.orderPlacementFaultInjector = null;
    expect((await post(payload)).status).toBe(200);
    expect(provider.createCalls).toBe(1);
    expect((await evidence()).orders).toBe(1);
  });

  it("reconciles by deterministic receipt after provider creation but before local provider-id persistence", async () => {
    let injected = false;
    app.locals.orderPlacementFaultInjector = async (stage) => {
      if (stage === "after_provider_creation" && !injected) {
        injected = true;
        throw new Error("simulated crash before provider id persistence");
      }
    };
    const payload = body(key("pre-persist-crash"));
    expect((await post(payload)).status).toBe(500);
    await ProviderOrderAttempt.updateOne({}, { $set: { updated_at: new Date(Date.now() - 31_000) } });
    app.locals.orderPlacementFaultInjector = null;
    const [a, b] = await Promise.all([post(payload, "process-a"), post(payload, "process-b")]);
    expect([a.status, b.status].some((status) => status === 200)).toBe(true);
    const final = await post(payload, "final-retry");
    expect(final.status).toBe(200);
    const state = await evidence();
    expect(state).toMatchObject({ orders: 1, attempts: 1, createCalls: 1, lookupCalls: 1, stock: 5, saleLedger: 0, couponUsage: 0, reconciliation: "linked" });
  });

  it("keeps provider creation exactly once across two request contexts", async () => {
    const payload = body(key("contexts"));
    const first = await post(payload, "browser-context-a");
    const second = await post(payload, "browser-context-b");
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.data.order.id).toBe(second.body.data.order.id);
    expect(provider.createCalls).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });
});
