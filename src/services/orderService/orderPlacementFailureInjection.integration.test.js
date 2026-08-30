import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import StockTransaction from "../../models/StockTransaction.js";
import CouponUsage from "../../models/CouponUsage.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import Cart from "../../models/Cart.js";

const uri = process.env.TEST_MONGODB_URI?.replace("/elexify_integration?", "/elexify_placement_integration?");
const suite = uri ? describe : describe.skip;
const STAGES = [
  "order_creation", "order_item_creation", "stock_reservation", "stock_ledger_creation",
  "coupon_usage_creation", "provider_attempt_persistence", "cart_mutation", "transaction_commit_boundary",
];
const oid = () => new mongoose.Types.ObjectId();

suite("order placement stage failure injection", () => {
  let userId;
  let productId;
  let couponId;
  let cartId;
  let attemptId;

  beforeAll(() => mongoose.connect(uri, { autoIndex: false }));

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      Order.createCollection(), OrderItem.createCollection(), Product.createCollection(),
      StockTransaction.createCollection(), CouponUsage.createCollection(),
      ProviderOrderAttempt.createCollection(), Cart.createCollection(),
    ]);
    await Order.collection.createIndex({ user: 1, idempotency_key: 1 }, {
      unique: true, partialFilterExpression: { idempotency_key: { $type: "string" } },
    });
    await StockTransaction.collection.createIndex(
      { reference_id: 1, product: 1, variation: 1, type: 1 },
      { unique: true, partialFilterExpression: { reference_type: "order" } },
    );
    await CouponUsage.collection.createIndex({ order: 1 }, { unique: true });
    await ProviderOrderAttempt.collection.createIndex({ user: 1, idempotency_key: 1 }, { unique: true });
    userId = oid(); productId = oid(); couponId = oid(); cartId = oid();
    await Product.collection.insertOne({ _id: productId, name: "Failure injection item", status: "active", stock_quantity: 5 });
    await Cart.collection.insertOne({ _id: cartId, user: userId, product: productId, quantity: 1, deleted_at: null });
    const attempt = await ProviderOrderAttempt.create({
      user: userId, idempotency_key: "failure-injection-key-0001", request_fingerprint: "same-payload",
      local_order_id: "ORD-FAILURE-INJECTION", provider: "razorpay", provider_order_id: "order_test_failure",
      amount: 100, currency: "INR", status: "created",
    });
    attemptId = attempt._id;
  });

  afterAll(async () => {
    if (uri) { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
  });

  const place = async ({ failAt = null } = {}) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    const fail = (stage) => { if (failAt === stage) throw new Error(`INJECTED:${stage}`); };
    try {
      const [order] = await Order.create([{
        id: "ORD-FAILURE-INJECTION", user: userId, idempotency_key: "failure-injection-key-0001",
        idempotency_fingerprint: "same-payload", payment_status: "pending", order_status: "pending",
        payment_method: "razorpay", total_amount: 100, grand_total: 100, currency: "INR",
      }], { session });
      fail("order_creation");
      await OrderItem.create([{ order_id: order._id, product_id: productId, quantity: 1, unit_price: 100, total_price: 100 }], { session });
      fail("order_item_creation");
      const stock = await Product.updateOne({ _id: productId, stock_quantity: { $gte: 1 } }, { $inc: { stock_quantity: -1 } }, { session });
      if ((stock.modifiedCount ?? stock.nModified) !== 1) throw new Error("OUT_OF_STOCK");
      fail("stock_reservation");
      await StockTransaction.create([{
        product: productId, variation: null, type: "sale", quantity: 1,
        reference_id: order._id, reference_type: "order", selling_price: 100,
      }], { session });
      fail("stock_ledger_creation");
      await CouponUsage.create([{
        coupon: couponId, user: userId, order: order._id, email: "redacted@example.test",
        discount_amount: 10, currency: "INR",
      }], { session });
      fail("coupon_usage_creation");
      await ProviderOrderAttempt.updateOne({ _id: attemptId }, { $set: { status: "linked" } }, { session });
      fail("provider_attempt_persistence");
      await Cart.updateOne({ _id: cartId }, { $set: { deleted_at: new Date() } }, { session });
      fail("cart_mutation");
      fail("transaction_commit_boundary");
      await session.commitTransaction();
      return order;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  };

  for (const stage of STAGES) {
    it(`rolls back ${stage} and permits one safe retry`, async () => {
      await expect(place({ failAt: stage })).rejects.toThrow(`INJECTED:${stage}`);
      expect(await Order.countDocuments()).toBe(0);
      expect(await OrderItem.countDocuments()).toBe(0);
      expect((await Product.findById(productId)).stock_quantity).toBe(5);
      expect(await StockTransaction.countDocuments()).toBe(0);
      expect(await CouponUsage.countDocuments()).toBe(0);
      expect((await Cart.findById(cartId)).deleted_at).toBeNull();
      expect((await ProviderOrderAttempt.findById(attemptId)).status).toBe("created");

      await place();
      await expect(place()).rejects.toMatchObject({ code: 11000 });
      expect(await Order.countDocuments({ idempotency_key: "failure-injection-key-0001" })).toBe(1);
      expect(await OrderItem.countDocuments()).toBe(1);
      expect((await Product.findById(productId)).stock_quantity).toBe(4);
      expect(await StockTransaction.countDocuments()).toBe(1);
      expect(await CouponUsage.countDocuments()).toBe(1);
      expect((await Cart.findById(cartId)).deleted_at).toBeTruthy();
      expect((await ProviderOrderAttempt.findById(attemptId)).status).toBe("linked");
    });
  }
});
