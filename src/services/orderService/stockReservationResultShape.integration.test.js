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
import Order from "../../models/Order.js";
import Pincode from "../../models/Pincode.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import ShippingSettings from "../../models/ShippingSettings.js";
import StockTransaction from "../../models/StockTransaction.js";
import User from "../../models/User.js";

// Permanent regression for the MongoDB driver v3 -> v4 write-result shape
// change (result.nModified -> result.modifiedCount) discovered during the
// Mongoose 5 -> 6 migration. Under driver v4, `result.nModified` is always
// undefined, so an un-fallback-guarded `result.nModified !== 1` check makes
// every stock reservation look like a conflict, regardless of real stock.
// This must stay green on whatever mongoose/driver combination is installed.
const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_stock_result_shape_integration$1",
);
const suite = uri ? describe : describe.skip;
const key = (suffix) => `stock-shape-${suffix}-00000001`;

suite("stock reservation write-result shape (COD, variation)", () => {
  let app;
  let user;
  let secondUser;
  let address;
  let secondUserAddress;
  let variation;

  const body = (idempotencyKey, overrides = {}) => ({
    currency: "INR",
    address_id: String(address._id),
    payment_method: "cod",
    idempotency_key: idempotencyKey,
    ...overrides,
  });

  const post = (payload, actingUser = user) => request(app)
    .post("/order/place")
    .set("x-test-user-id", String(actingUser._id))
    .send(payload);

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
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      Order.syncIndexes(),
      StockTransaction.syncIndexes(),
    ]);
    [user, secondUser] = await User.create([
      { role: "customer", name: "Shape Customer", email: "shape-1@example.test", status: "active" },
      { role: "customer", name: "Shape Customer Two", email: "shape-2@example.test", status: "active" },
    ]);
    [address, secondUserAddress] = await Address.create([
      {
        user: user._id, full_name: "Shape Customer", phone: "9876543210",
        address_line_1: "1 Shape Street", state: 19, country: 101, postcode: "700001",
      },
      {
        user: secondUser._id, full_name: "Shape Customer Two", phone: "9876543211",
        address_line_1: "2 Shape Street", state: 19, country: 101, postcode: "700001",
      },
    ]);
    const product = await Product.create({
      name: "Stock Shape Product",
      slug: "stock-shape-product",
      sku: "STOCK-SHAPE-1",
      regular_price: 100,
      stock_quantity: 50,
      status: "active",
      cod_status: "allowed",
    });
    variation = await ProductVariation.create({
      product_id: product._id,
      combination_key: "size-m",
      sku: "STOCK-SHAPE-1-M",
      regular_price: 100,
      stock_quantity: 1,
      status: "active",
      cod_status: "allowed",
    });
    await Cart.create({ user: user._id, product: product._id, variation: variation._id, quantity: 1, price: 100 });
    await Cart.create({ user: secondUser._id, product: product._id, variation: variation._id, quantity: 1, price: 100 });
    await Pincode.create({ pincode: "700001", status: "active", cod_status: "allowed" });
    await ShippingSettings.create({ cod_enabled: true, cod_charge_enabled: false });
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("reserves variation stock exactly once and reports the real driver-v4 result shape", async () => {
    const res = await post(body(key("single")));
    expect(res.status).toBe(200);
    expect((await ProductVariation.findById(variation._id).lean()).stock_quantity).toBe(0);
    expect(await StockTransaction.countDocuments({ variation: variation._id, type: "sale" })).toBe(1);
  });

  it("lets exactly one of two concurrent buyers win the final variation unit, the other genuinely OUT_OF_STOCK", async () => {
    const [first, second] = await Promise.all([
      post(body(key("race-a"))),
      post(body(key("race-b"), { address_id: String(secondUserAddress._id) }), secondUser),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const failed = first.status === 409 ? first : second;
    expect(failed.body.message).toMatch(/OUT_OF_STOCK/i);
    expect((await ProductVariation.findById(variation._id).lean()).stock_quantity).toBe(0);
    expect(await StockTransaction.countDocuments({ variation: variation._id, type: "sale" })).toBe(1);
  });

  it("rejects a reservation attempt against a variation that is already out of stock", async () => {
    await ProductVariation.updateOne({ _id: variation._id }, { stock_quantity: 0 });
    const res = await post(body(key("already-empty")));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/OUT_OF_STOCK/i);
    expect(await StockTransaction.countDocuments({ variation: variation._id, type: "sale" })).toBe(0);
  });
});
