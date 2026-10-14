import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockReservation from "../../models/StockReservation.js";
import StockTransaction from "../../models/StockTransaction.js";
import {
  adjustStock,
  commitOrder,
  commitReservation,
  releaseReservation,
  reserveOrder,
  revertOrderStock,
  setStockCount,
  withStockTransaction,
} from "./mutations.js";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_stock_mutations_integration$1",
);
const suite = uri ? describe : describe.skip;

const inTx = (work) => withStockTransaction(work);
const sku = async (id) => (await ProductVariation.findById(id).lean()) || Product.findById(id).lean();
const ledgerSum = async (filter) => {
  const [row] = await StockTransaction.aggregate([
    { $match: { ...filter, delta: { $exists: true } } },
    { $group: { _id: null, sum: { $sum: "$delta" } } },
  ]);
  return row?.sum ?? 0;
};

suite("services/stock mutations", () => {
  let product;
  let variation;
  let order;

  const fakeOrder = (overrides = {}) => ({ _id: new mongoose.Types.ObjectId(), stock_epoch: 0, ...overrides });
  const addItems = async (o, quantity) => OrderItem.create({
    order_id: o._id, product_id: product._id, variation_id: variation._id,
    quantity, unit_price: 100, total_price: 100 * quantity,
  });

  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: false });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([StockTransaction.syncIndexes(), StockReservation.syncIndexes()]);
    product = await Product.create({
      name: "Stock Svc Product", slug: "stock-svc-product", type: "variable",
      regular_price: 100, status: "active",
    });
    variation = await ProductVariation.create({
      product_id: product._id, combination_key: "svc-m", sku: "SVC-M",
      regular_price: 100, stock_quantity: 3, status: "active",
    });
    order = fakeOrder();
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("derives stock_status on save and rolls it up to the variable parent", async () => {
    expect((await sku(variation._id)).stock_status).toBe("in_stock");
    await inTx((session) => adjustStock({ product: product._id, variation: variation._id, delta: -3, reason: "damage", session }));
    expect((await sku(variation._id)).stock_status).toBe("out_of_stock");
    expect((await Product.findById(product._id).lean()).stock_status).toBe("out_of_stock");
  });

  it("reserve → commit moves reserved into a sale with balance_after", async () => {
    await addItems(order, 2);
    await inTx((session) => reserveOrder({ order, expiresAt: new Date(Date.now() + 60_000), session }));
    let doc = await sku(variation._id);
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([3, 2]);

    await inTx((session) => commitReservation({ order, session }));
    doc = await sku(variation._id);
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([1, 0]);
    const sale = await StockTransaction.findOne({ type: "sale" }).lean();
    expect(sale).toMatchObject({ delta: -2, balance_after: 1, reason: "order_sale" });
    expect(await StockReservation.countDocuments({ status: "committed" })).toBe(1);
  });

  it("blocks a second reservation of the last units", async () => {
    const other = fakeOrder();
    await inTx((session) => reserveOrder({ order, items: [{ product_id: product._id, variation_id: variation._id, quantity: 2 }], expiresAt: new Date(), session }));
    await expect(inTx((session) => reserveOrder({ order: other, items: [{ product_id: product._id, variation_id: variation._id, quantity: 2 }], expiresAt: new Date(), session })))
      .rejects.toThrow("OUT_OF_STOCK");
    expect((await sku(variation._id)).reserved_quantity).toBe(2);
  });

  it("merges duplicate SKU lines before reserving", async () => {
    const items = [1, 1].map((quantity) => ({ product_id: product._id, variation_id: variation._id, quantity }));
    await inTx((session) => reserveOrder({ order, items, expiresAt: new Date(), session }));
    expect(await StockReservation.countDocuments()).toBe(1);
    expect((await sku(variation._id)).reserved_quantity).toBe(2);
  });

  it("release frees the hold once, with no ledger row", async () => {
    await inTx((session) => reserveOrder({ order, items: [{ product_id: product._id, variation_id: variation._id, quantity: 2 }], expiresAt: new Date(), session }));
    await inTx((session) => releaseReservation({ order, reason: "expired", session }));
    await inTx((session) => releaseReservation({ order, reason: "expired", session }));
    const doc = await sku(variation._id);
    expect([doc.stock_quantity, doc.reserved_quantity]).toEqual([3, 0]);
    expect(await StockTransaction.countDocuments()).toBe(0);
  });

  it("commit is idempotent and cancel → reopen → cancel keeps the ledger equal to on-hand", async () => {
    await addItems(order, 1);
    await inTx((session) => commitOrder({ order, session }));
    await inTx((session) => commitOrder({ order, session }));
    expect((await sku(variation._id)).stock_quantity).toBe(2);

    await inTx((session) => revertOrderStock({ order: { ...order, stock_state: "committed" }, session }));
    const reopened = { ...order, stock_epoch: 1 };
    await inTx((session) => commitOrder({ order: reopened, session }));
    await inTx((session) => revertOrderStock({ order: { ...reopened, stock_state: "committed" }, session }));

    expect((await sku(variation._id)).stock_quantity).toBe(3);
    expect(await ledgerSum({ variation: variation._id })).toBe(0);
    expect(await StockTransaction.countDocuments()).toBe(4);
  });

  it("adjust enforces expected on-hand and never drops below reserved", async () => {
    await expect(inTx((session) => adjustStock({ product: product._id, variation: variation._id, delta: 5, reason: "received", expectedOnHand: 2, session })))
      .rejects.toMatchObject({ statusCode: 409 });

    await inTx((session) => reserveOrder({ order, items: [{ product_id: product._id, variation_id: variation._id, quantity: 2 }], expiresAt: new Date(), session }));
    await expect(inTx((session) => adjustStock({ product: product._id, variation: variation._id, delta: -2, reason: "loss", session })))
      .rejects.toMatchObject({ statusCode: 400 });

    const { doc } = await inTx((session) => setStockCount({ product: product._id, variation: variation._id, count: 10, reason: "count_correction", expectedOnHand: 3, session }));
    expect(doc.stock_quantity).toBe(10);
    expect(await StockTransaction.findOne({ reason: "count_correction" }).lean()).toMatchObject({ delta: 7, balance_after: 10 });
  });

  it("lets backorder SKUs sell past zero and reports on_backorder", async () => {
    await ProductVariation.updateOne({ _id: variation._id }, { allow_backorders: true });
    await inTx((session) => commitOrder({ order, items: [{ product_id: product._id, variation_id: variation._id, quantity: 5 }], session }));
    const doc = await sku(variation._id);
    expect(doc.stock_quantity).toBe(-2);
    expect(doc.stock_status).toBe("on_backorder");
  });
});
