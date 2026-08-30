import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { errors } from "celebrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleError } from "../../config/handleErrors.js";
import { add } from "../../controllers/site/inventory/order/add.js";
import { place } from "../../validations/site/inventory/order/place.js";
import Address from "../../models/Address.js";
import Cart from "../../models/Cart.js";
import Coupon from "../../models/Coupon.js";
import CouponUsage from "../../models/CouponUsage.js";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Pincode from "../../models/Pincode.js";
import Product from "../../models/Product.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import ShippingSettings from "../../models/ShippingSettings.js";
import StockTransaction from "../../models/StockTransaction.js";
import User from "../../models/User.js";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_http_checkout_integration$1",
);
const suite = uri ? describe : describe.skip;
const key = (suffix) => `http-checkout-${suffix}-00000001`;

suite("real HTTP checkout concurrency and recovery", () => {
  let app;
  let server;
  let baseUrl;
  let user;
  let secondUser;
  let address;
  let secondAddress;
  let secondUserAddress;
  let product;
  let coupon;

  const body = (idempotencyKey, overrides = {}) => ({
    currency: "INR",
    address_id: String(address._id),
    payment_method: "cod",
    coupon_code: "HTTP10",
    idempotency_key: idempotencyKey,
    ...overrides,
  });

  const post = (payload, context = "api", actingUser = user) => request(app)
    .post("/order/place")
    .set("x-test-user-id", String(actingUser._id))
    .set("x-test-context", context)
    .send(payload);

  const snapshot = async () => ({
    orders: await Order.countDocuments(),
    providerAttempts: await ProviderOrderAttempt.countDocuments(),
    stock: (await Product.findById(product._id).lean()).stock_quantity,
    stockLedger: await StockTransaction.countDocuments({ type: "sale" }),
    couponUsage: await CouponUsage.countDocuments(),
    couponTotalUsed: (await Coupon.findById(coupon._id).lean()).total_used,
  });

  const disconnectAt = async (stage, idempotencyKey) => {
    let release;
    let reached;
    const reachedStage = new Promise((resolve) => { reached = resolve; });
    const continueRequest = new Promise((resolve) => { release = resolve; });
    app.locals.orderPlacementFaultInjector = async (currentStage) => {
      if (currentStage === stage) {
        reached();
        await continueRequest;
      }
    };
    const payload = JSON.stringify(body(idempotencyKey));
    const req = http.request(`${baseUrl}/order/place`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-test-user-id": String(user._id),
      },
    });
    req.on("error", () => undefined);
    req.write(payload);
    req.end();
    await reachedStage;
    req.destroy();
    release();
    app.locals.orderPlacementFaultInjector = null;
    await new Promise((resolve) => setTimeout(resolve, 100));
  };

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
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    app.locals.orderPlacementFaultInjector = null;
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      Order.syncIndexes(),
      StockTransaction.syncIndexes(),
      CouponUsage.syncIndexes(),
      ProviderOrderAttempt.syncIndexes(),
    ]);
    [user, secondUser] = await User.create([
      {
        role: "customer",
        name: "HTTP Checkout Customer",
        email: "http-checkout@example.test",
        status: "active",
      },
      {
        role: "customer",
        name: "HTTP Checkout Customer Two",
        email: "http-checkout-two@example.test",
        status: "active",
      },
    ]);
    [address, secondAddress] = await Address.create([
      {
        user: user._id,
        full_name: "HTTP Customer",
        phone: "9876543210",
        address_line_1: "1 Integration Street",
        state: 19,
        country: 101,
        postcode: "700001",
      },
      {
        user: user._id,
        full_name: "HTTP Customer",
        phone: "9876543210",
        address_line_1: "2 Integration Street",
        state: 19,
        country: 101,
        postcode: "700001",
      },
    ]);
    secondUserAddress = await Address.create({
      user: secondUser._id,
      full_name: "HTTP Customer Two",
      phone: "9876543211",
      address_line_1: "3 Integration Street",
      state: 19,
      country: 101,
      postcode: "700001",
    });
    product = await Product.create({
      name: "HTTP Checkout Product",
      slug: "http-checkout-product",
      sku: "HTTP-CHECKOUT-1",
      regular_price: 100,
      stock_quantity: 10,
      status: "active",
      cod_status: "allowed",
    });
    await Cart.create({ user: user._id, product: product._id, quantity: 1, price: 100 });
    await Cart.create({ user: secondUser._id, product: product._id, quantity: 1, price: 100 });
    coupon = await Coupon.create({
      code: "HTTP10",
      title: "HTTP ten percent",
      discount_type: "percentage",
      discount_value: 10,
      applicable_for: "user",
      applicable_scope: "all",
      usage_per_email: 20,
      start_date: new Date(Date.now() - 86_400_000),
      end_date: new Date(Date.now() + 86_400_000),
      status: "active",
    });
    await Pincode.create({ pincode: "700001", status: "active", cod_status: "allowed" });
    await ShippingSettings.create({ cod_enabled: true, cod_charge_enabled: false });
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("returns one logical COD order for simultaneous identical submissions", async () => {
    const idempotencyKey = key("same");
    const [first, second] = await Promise.all([
      post(body(idempotencyKey), "tab-a"),
      post(body(idempotencyKey), "tab-b"),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.data.order.id).toBe(second.body.data.order.id);
    expect(await snapshot()).toEqual({
      orders: 1,
      providerAttempts: 0,
      stock: 9,
      stockLedger: 1,
      couponUsage: 1,
      couponTotalUsed: 1,
    });
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const idempotencyKey = key("mismatch");
    expect((await post(body(idempotencyKey))).status).toBe(200);
    const conflict = await post(body(idempotencyKey, { address_id: String(secondAddress._id) }));
    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toMatch(/different checkout request/i);
    expect((await snapshot()).orders).toBe(1);
    expect((await snapshot()).stock).toBe(9);
  });

  it("allows exactly one of two keys to buy the final unit", async () => {
    await Product.updateOne({ _id: product._id }, { stock_quantity: 1 });
    const [first, second] = await Promise.all([
      post(body(key("stock-a")), "tab-a"),
      post(
        body(key("stock-b"), { address_id: String(secondUserAddress._id) }),
        "tab-b",
        secondUser,
      ),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const failed = first.status === 409 ? first : second;
    expect(failed.body.message).toMatch(/OUT_OF_STOCK/i);
    expect(await snapshot()).toEqual({
      orders: 1,
      providerAttempts: 0,
      stock: 0,
      stockLedger: 1,
      couponUsage: 1,
      couponTotalUsed: 1,
    });
  });

  it("recovers when the response is lost immediately after commit", async () => {
    const idempotencyKey = key("after-commit");
    await disconnectAt("after_commit", idempotencyKey);
    const retry = await post(body(idempotencyKey));
    expect(retry.status).toBe(200);
    expect(retry.body.message).toBe("Order already placed");
    expect((await snapshot()).orders).toBe(1);
    expect((await snapshot()).stockLedger).toBe(1);
    expect((await snapshot()).couponUsage).toBe(1);
  });

  for (const stage of ["before_transaction", "order_creation", "after_commit"]) {
    it(`converges deterministically after client disconnect at ${stage}`, async () => {
      const idempotencyKey = key(`disconnect-${stage}`);
      await disconnectAt(stage, idempotencyKey);
      const retry = await post(body(idempotencyKey));
      expect(retry.status).toBe(200);
      expect((await snapshot()).orders).toBe(1);
      expect((await snapshot()).stock).toBe(9);
      expect((await snapshot()).stockLedger).toBe(1);
      expect((await snapshot()).couponUsage).toBe(1);
    });
  }
});
