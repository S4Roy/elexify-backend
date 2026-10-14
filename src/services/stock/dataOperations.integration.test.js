import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import StockTransaction from "../../models/StockTransaction.js";
import foundation from "../../scripts/seeders/registry/operations/stock-ledger-foundation.js";
import reconcile from "../../scripts/seeders/registry/operations/stock-reconcile.js";
import fixProviderIndex from "../../scripts/seeders/registry/operations/fix-provider-attempt-index.js";
import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import { adjustStock, withStockTransaction } from "./mutations.js";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_stock_data_ops_integration$1");
const suite = uri ? describe : describe.skip;
const logger = { info: () => {}, warn: () => {}, error: () => {} };
const run = (op, dryRun = false) => op.handler({ dryRun, logger });
const oid = () => new mongoose.Types.ObjectId();

suite("stock data operations", () => {
  let simpleId;
  let variableId;
  let variationId;

  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: false });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    // Pre-migration shape: no stock fields beyond stock_quantity, the old
    // ledger unique index, a legacy (delta-less) sale row.
    simpleId = oid();
    variableId = oid();
    variationId = oid();
    await Product.collection.insertMany([
      { _id: simpleId, name: "Legacy simple", type: "simple", status: "active", stock_quantity: 7, deleted_at: null },
      { _id: variableId, name: "Legacy variable", type: "variable", status: "active", stock_quantity: 0, deleted_at: null },
    ]);
    await ProductVariation.collection.insertOne({ _id: variationId, product_id: variableId, status: "active", stock_quantity: 2, deleted_at: null });
    await StockTransaction.collection.createIndex(
      { reference_id: 1, product: 1, variation: 1, type: 1 },
      { unique: true, partialFilterExpression: { reference_type: "order" } },
    );
    await StockTransaction.collection.insertOne({ product: simpleId, variation: null, type: "sale", quantity: 1, reference_id: oid(), reference_type: "order", deleted_at: null });
    await Order.collection.insertMany([
      { id: "LEGACY-1", stock_reserved: true, inventory_reverted: false },
      { id: "LEGACY-2", stock_reserved: true, inventory_reverted: true },
      { id: "LEGACY-3", stock_reserved: false },
    ]);
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("dry run changes nothing", async () => {
    const plan = await run(foundation, true);
    expect(plan).toMatchObject({ wouldInsert: 2, wouldDelete: 1 });
    expect(await StockTransaction.countDocuments({ type: "opening_balance" })).toBe(0);
    expect((await Product.collection.findOne({ _id: simpleId })).reserved_quantity).toBeUndefined();
  });

  it("backfills fields, books openings, swaps indexes and is idempotent", async () => {
    await run(foundation);
    await run(foundation);

    const simple = await Product.collection.findOne({ _id: simpleId });
    expect(simple).toMatchObject({ reserved_quantity: 0, manage_stock: true, allow_backorders: false, stock_status: "in_stock", stock_quantity: 7 });
    expect((await Product.collection.findOne({ _id: variableId })).stock_status).toBe("in_stock");

    const openings = await StockTransaction.find({ type: "opening_balance" }).lean();
    expect(openings.map((o) => [String(o.variation || o.product), o.delta]).sort()).toEqual([[String(simpleId), 7], [String(variationId), 2]].sort());

    const indexes = await StockTransaction.collection.indexes();
    expect(indexes.some((i) => i.unique && i.key.reference_id)).toBe(false);
    expect(indexes.some((i) => i.unique && i.key.idempotency_key)).toBe(true);

    const states = Object.fromEntries((await Order.collection.find().toArray()).map((o) => [o.id, o.stock_state]));
    expect(states).toEqual({ "LEGACY-1": "committed", "LEGACY-2": "restocked", "LEGACY-3": "none" });
  });

  it("nets out ledger rows the new code wrote before the migration ran", async () => {
    await StockTransaction.syncIndexes();
    await withStockTransaction((session) => adjustStock({ product: simpleId, delta: 3, reason: "received", session }));
    await run(foundation);
    const opening = await StockTransaction.findOne({ type: "opening_balance", product: simpleId, variation: null }).lean();
    expect(opening.delta).toBe(7);
    expect((await run(reconcile, true)).warnings).toEqual([]);
  });

  it("reconcile reports and repairs drift without touching on-hand", async () => {
    await run(foundation);
    expect((await run(reconcile, true)).warnings).toEqual([]);

    await Product.collection.updateOne({ _id: simpleId }, { $set: { stock_quantity: 9, reserved_quantity: 4 } });
    const report = await run(reconcile, true);
    expect(report).toMatchObject({ wouldInsert: 1, wouldUpdate: 1 });

    await run(reconcile);
    const simple = await Product.collection.findOne({ _id: simpleId });
    expect([simple.stock_quantity, simple.reserved_quantity]).toEqual([9, 0]);
    expect((await run(reconcile, true)).warnings).toEqual([]);
  });

  it("fix-provider-attempt-index lets concurrent attempts without a provider id coexist", async () => {
    await ProviderOrderAttempt.collection.createIndex({ provider_order_id: 1 }, { unique: true, sparse: true });
    const attempt = (n, providerOrderId = null) => ({
      user: oid(), idempotency_key: `k${n}`, request_fingerprint: "f", local_order_id: `L${n}`,
      provider: "razorpay", provider_order_id: providerOrderId, amount: 1, currency: "INR",
    });
    await ProviderOrderAttempt.collection.insertOne(attempt(1));
    await expect(ProviderOrderAttempt.collection.insertOne(attempt(2))).rejects.toMatchObject({ code: 11000 });

    expect(await run(fixProviderIndex, true)).toMatchObject({ wouldInsert: 1, wouldDelete: 1 });
    await run(fixProviderIndex);
    await run(fixProviderIndex);

    await ProviderOrderAttempt.collection.insertOne(attempt(2));
    await ProviderOrderAttempt.collection.insertOne(attempt(3, "order_x"));
    await expect(ProviderOrderAttempt.collection.insertOne(attempt(4, "order_x"))).rejects.toMatchObject({ code: 11000 });
    const names = (await ProviderOrderAttempt.collection.indexes()).map((i) => i.name);
    expect(names).toContain("provider_order_id_unique");
    expect(names).not.toContain("provider_order_id_1");
  });
});
