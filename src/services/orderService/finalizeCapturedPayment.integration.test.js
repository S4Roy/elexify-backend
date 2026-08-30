import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { finalizeCapturedPayment } from "./finalizeCapturedPayment.js";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import StockTransaction from "../../models/StockTransaction.js";
import CouponUsage from "../../models/CouponUsage.js";
import Coupon from "../../models/Coupon.js";
import User from "../../models/User.js";
import { getOrGenerateInvoice } from "../invoiceService/getOrGenerateInvoice.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import { cancelOrder } from "./cancelOrder.js";

const uri = process.env.TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const oid = () => new mongoose.Types.ObjectId();

const paymentFor = (order, paymentId) => ({
  id: paymentId,
  order_id: order.payment_meta.razorpay_order_id,
  status: "captured",
  amount: Math.round(order.grand_total * 100),
  currency: order.currency,
  method: "upi",
});

const seedOrder = async ({ productIds, quantities, suffix, coupon = false }) => {
  const userId = oid();
  await User.collection.insertOne({
    _id: userId, email: `buyer-${suffix}@example.test`, role: "customer", status: "active",
  });
  const order = await Order.create({
    id: `ORD-IT-${suffix}`,
    user: userId,
    payment_status: "pending",
    order_status: "pending",
    payment_method: "razorpay",
    total_amount: 100,
    discount: coupon ? 10 : 0,
    grand_total: coupon ? 90 : 100,
    currency: "INR",
    coupon_code: coupon ? `SAVE-${suffix}` : null,
    payment_meta: { razorpay_order_id: `order_rzp_${suffix}` },
  });
  if (coupon) {
    await Coupon.collection.insertOne({
      code: `SAVE-${suffix}`.toUpperCase(), status: "active", total_used: 0,
    });
  }
  await OrderItem.insertMany(productIds.map((productId, index) => ({
    order_id: order._id,
    product_id: productId,
    quantity: quantities[index],
    unit_price: 100,
    total_price: 100,
    regular_price: 100,
    currency: "INR",
  })));
  return order;
};

suite("finalizeCapturedPayment replica-set integration", () => {
  beforeAll(async () => {
    await mongoose.connect(uri);
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await StockTransaction.collection.createIndex(
      { reference_id: 1, product: 1, variation: 1, type: 1 },
      { unique: true, partialFilterExpression: { reference_type: "order" } },
    );
    await CouponUsage.collection.createIndex({ order: 1 }, { unique: true });
    await Order.collection.createIndex(
      { user: 1, idempotency_key: 1 },
      { unique: true, partialFilterExpression: { idempotency_key: { $type: "string" } } },
    );
    await ProviderOrderAttempt.collection.createIndex({ user: 1, idempotency_key: 1 }, { unique: true });
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("allows exactly one of two orders to buy the last unit", async () => {
    const productId = oid();
    await Product.collection.insertOne({ _id: productId, name: "Last unit", status: "active", stock_quantity: 1 });
    const first = await seedOrder({ productIds: [productId], quantities: [1], suffix: "race-a", coupon: true });
    const second = await seedOrder({ productIds: [productId], quantities: [1], suffix: "race-b" });

    const results = await Promise.allSettled([
      finalizeCapturedPayment({ orderId: first.id, paymentData: paymentFor(first, "pay_race_a"), source: "integration" }),
      finalizeCapturedPayment({ orderId: second.id, paymentData: paymentFor(second, "pay_race_b"), source: "integration" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason.message).toContain("OUT_OF_STOCK");
    expect((await Product.findById(productId)).stock_quantity).toBe(0);
    expect(await StockTransaction.countDocuments({ product: productId, type: "sale" })).toBe(1);
    expect(await CouponUsage.countDocuments()).toBeLessThanOrEqual(1);
    const failed = results[0].status === "rejected" ? first : second;
    expect((await Order.findById(failed._id)).stock_reserved).toBe(false);
  });

  it("rolls back every line, ledger and coupon when one SKU is unavailable", async () => {
    const available = oid();
    const unavailable = oid();
    await Product.collection.insertMany([
      { _id: available, name: "Available", status: "active", stock_quantity: 5 },
      { _id: unavailable, name: "Unavailable", status: "active", stock_quantity: 0 },
    ]);
    const order = await seedOrder({
      productIds: [available, unavailable], quantities: [2, 1], suffix: "rollback", coupon: true,
    });
    await expect(finalizeCapturedPayment({
      orderId: order.id, paymentData: paymentFor(order, "pay_rollback"), source: "integration",
    })).rejects.toThrow("OUT_OF_STOCK");

    expect((await Product.findById(available)).stock_quantity).toBe(5);
    expect(await StockTransaction.countDocuments({ reference_id: order._id })).toBe(0);
    expect(await CouponUsage.countDocuments({ order: order._id })).toBe(0);
    const unchanged = await Order.findById(order._id);
    expect(unchanged.payment_status).toBe("pending");
    expect(unchanged.stock_reserved).toBe(false);
  });

  it("finalizes concurrent duplicate requests exactly once", async () => {
    const productId = oid();
    await Product.collection.insertOne({ _id: productId, name: "Idempotent", status: "active", stock_quantity: 2 });
    const order = await seedOrder({ productIds: [productId], quantities: [1], suffix: "duplicate", coupon: true });
    expect((await Order.findById(order._id)).coupon_code).toBe("SAVE-duplicate");
    expect(await Coupon.findOne({ code: "SAVE-duplicate" })).toBeTruthy();
    expect((await User.findById(order.user)).email).toContain("@example.test");
    const request = () => finalizeCapturedPayment({
      orderId: order.id, paymentData: paymentFor(order, "pay_duplicate"), source: "integration",
    });
    const results = await Promise.allSettled([request(), request(), request()]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await Product.findById(productId)).stock_quantity).toBe(1);
    expect(await StockTransaction.countDocuments({ reference_id: order._id, type: "sale" })).toBe(1);
    expect(await CouponUsage.countDocuments({ order: order._id })).toBe(1);
    expect((await Order.findById(order._id)).payment_status).toBe("paid");
  });

  it("restores COD stock exactly once across duplicate cancellation", async () => {
    const productId = oid();
    await Product.collection.insertOne({ _id: productId, name: "COD", status: "active", stock_quantity: 3 });
    const userId = oid();
    await User.collection.insertOne({ _id: userId, email: "cod@example.test", role: "customer", status: "active" });
    const order = await Order.create({
      id: "ORD-IT-COD-CANCEL", user: userId, payment_status: "pending", order_status: "pending",
      payment_method: "cod", total_amount: 100, grand_total: 100, currency: "INR", stock_reserved: true,
    });
    await OrderItem.create({
      order_id: order._id, product_id: productId, quantity: 1,
      unit_price: 100, total_price: 100, regular_price: 100,
    });
    await StockTransaction.create({
      product: productId, type: "sale", quantity: 1, reference_id: order._id,
      reference_type: "order", selling_price: 100,
    });

    await Promise.all([
      cancelOrder({ orderId: String(order._id), actorType: "customer", actorId: userId, reason: "Changed my mind" }),
      cancelOrder({ orderId: String(order._id), actorType: "customer", actorId: userId, reason: "Changed my mind" }),
    ]);

    expect((await Product.findById(productId)).stock_quantity).toBe(4);
    expect(await StockTransaction.countDocuments({ reference_id: order._id, type: "return" })).toBe(1);
    expect((await Order.findById(order._id)).inventory_reverted).toBe(true);
  });

  it("generates invoice totals exclusively from immutable line snapshots", async () => {
    const firstProduct = oid();
    const secondProduct = oid();
    await Product.collection.insertMany([
      { _id: firstProduct, name: "Current name one", sku: "CURRENT-1", status: "active", stock_quantity: 10, regular_price: 999 },
      { _id: secondProduct, name: "Current name two", sku: "CURRENT-2", status: "active", stock_quantity: 10, regular_price: 999 },
    ]);
    const userId = oid();
    await User.collection.insertOne({ _id: userId, email: "invoice@example.test", role: "customer", status: "active" });
    const order = await Order.create({
      id: "ORD-IT-INVOICE", user: userId, payment_status: "paid", order_status: "processing",
      payment_method: "razorpay", total_amount: 300, discount: 15, shipping: 10,
      grand_total: 295, currency: "INR",
      billing_address_snapshot: { state: "Karnataka", address_line_1: "Historical billing" },
      shipping_address_snapshot: { state: "Karnataka", address_line_1: "Historical shipping" },
    });
    await OrderItem.insertMany([
      {
        order_id: order._id, product_id: firstProduct, product_name: "Historical one", sku: "OLD-1",
        quantity: 2, unit_price: 100, total_price: 200, regular_price: 110,
        sale_discount: 20, quantity_discount: 0, coupon_discount: 10, shipping_allocation: 4,
        taxable_amount: 164.41, tax_rate: 18, tax_amount: 29.59, cgst: 14.8, sgst: 14.79,
        final_line_total: 194,
      },
      {
        order_id: order._id, product_id: secondProduct, product_name: "Historical two", sku: "OLD-2",
        quantity: 1, unit_price: 100, total_price: 100, regular_price: 105,
        sale_discount: 0, quantity_discount: 5, coupon_discount: 5, shipping_allocation: 6,
        taxable_amount: 85.59, tax_rate: 18, tax_amount: 15.41, cgst: 7.7, sgst: 7.71,
        final_line_total: 101,
      },
    ]);
    await Product.updateMany(
      { _id: { $in: [firstProduct, secondProduct] } },
      { $set: { name: "Changed after purchase", regular_price: 1 } },
    );

    const invoice = await getOrGenerateInvoice({ orderId: String(order._id), actorType: "system" });
    expect(Array.from(invoice.items, (item) => String(item.product_name))).toEqual(["Historical one", "Historical two"]);
    expect(invoice.items.reduce((sum, item) => sum + item.total, 0)).toBe(295);
    expect(invoice.totals.product_discount).toBe(25);
    expect(invoice.totals.coupon_discount).toBe(15);
    expect(invoice.totals.shipping).toBe(10);
    expect(invoice.totals.tax_total).toBe(45);
    expect(invoice.totals.grand_total).toBe(295);
    expect(invoice.is_gst_applicable).toBe(true);

    const interstateOrder = await Order.create({
      id: "ORD-IT-INVOICE-IGST", user: userId, payment_status: "paid", order_status: "processing",
      payment_method: "razorpay", total_amount: 118, discount: 0, shipping: 0,
      grand_total: 118, currency: "INR",
      billing_address_snapshot: { state: "Maharashtra", address_line_1: "Historical interstate billing" },
      shipping_address_snapshot: { state: "Maharashtra", address_line_1: "Historical interstate shipping" },
    });
    await OrderItem.create({
      order_id: interstateOrder._id, product_id: firstProduct, product_name: "Historical IGST item", sku: "OLD-IGST",
      quantity: 1, unit_price: 118, total_price: 118, regular_price: 118,
      sale_discount: 0, quantity_discount: 0, coupon_discount: 0, shipping_allocation: 0,
      taxable_amount: 100, tax_rate: 18, tax_amount: 18, cgst: 0, sgst: 0, igst: 18,
      final_line_total: 118,
    });
    const interstateInvoice = await getOrGenerateInvoice({ orderId: String(interstateOrder._id), actorType: "system" });
    expect(interstateInvoice.items[0].igst).toBe(18);
    expect(interstateInvoice.items[0].cgst).toBe(0);
    expect(interstateInvoice.items[0].sgst).toBe(0);
    expect(interstateInvoice.totals.tax_total).toBe(18);
    expect(interstateInvoice.totals.grand_total).toBe(118);
  });

  it("enforces checkout and provider correlation idempotency at database level", async () => {
    const userId = oid();
    const base = {
      user: userId, idempotency_key: "checkout-key-concurrent-0001", idempotency_fingerprint: "same-request",
      payment_status: "pending", order_status: "pending", payment_method: "cod",
      total_amount: 100, grand_total: 100, currency: "INR",
    };
    const orders = await Promise.allSettled([
      Order.create({ ...base, id: "ORD-IDEMPOTENT-A" }),
      Order.create({ ...base, id: "ORD-IDEMPOTENT-B" }),
    ]);
    expect(orders.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(orders.filter((result) => result.status === "rejected")[0].reason.code).toBe(11000);
    expect(await Order.countDocuments({ user: userId, idempotency_key: base.idempotency_key })).toBe(1);

    const attempts = await Promise.allSettled([
      ProviderOrderAttempt.create({
        user: userId, idempotency_key: base.idempotency_key, request_fingerprint: "same-request",
        local_order_id: "ORD-IDEMPOTENT-A", provider: "razorpay", amount: 100, currency: "INR",
      }),
      ProviderOrderAttempt.create({
        user: userId, idempotency_key: base.idempotency_key, request_fingerprint: "different-request",
        local_order_id: "ORD-IDEMPOTENT-B", provider: "razorpay", amount: 101, currency: "INR",
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await ProviderOrderAttempt.countDocuments({ user: userId, idempotency_key: base.idempotency_key })).toBe(1);
  });
});
