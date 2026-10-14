import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { errors } from "celebrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleError } from "../../../../config/handleErrors.js";
import AuditLog from "../../../../models/AuditLog.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import StockReservation from "../../../../models/StockReservation.js";
import StockTransaction from "../../../../models/StockTransaction.js";
import * as validation from "../../../../validations/admin/inventory/stock/index.js";
import { adjust, bulkAdjust, levels, list } from "./index.js";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_admin_stock_integration$1");
const suite = uri ? describe : describe.skip;

suite("admin stock API", () => {
  let app;
  let simple;
  let variable;
  let variation;
  const adminId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: false });
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.__ = (message) => message;
      req.auth = { user_id: String(adminId) };
      next();
    });
    app.post("/adjust", validation.adjust, adjust);
    app.post("/adjust/bulk", validation.bulkAdjust, bulkAdjust);
    app.get("/levels", validation.levels, levels);
    app.get("/transactions", validation.list, list);
    app.use(errors());
    app.use(handleError);
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([StockTransaction.syncIndexes(), StockReservation.syncIndexes()]);
    simple = await Product.create({ name: "Admin Simple", slug: "admin-simple", sku: "ADM-S", regular_price: 10, stock_quantity: 5, status: "active" });
    variable = await Product.create({ name: "Admin Variable", slug: "admin-variable", type: "variable", status: "active" });
    variation = await ProductVariation.create({ product_id: variable._id, combination_key: "adm-red", sku: "ADM-V-RED", regular_price: 10, stock_quantity: 1, status: "active" });
  });

  afterAll(async () => {
    if (uri) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("adjusts by delta and by counted set, with ledger, audit and levels", async () => {
    const received = await request(app).post("/adjust").send({
      product: String(simple._id), mode: "delta", quantity: 10, reason: "received", note: "PO 42", expected_on_hand: 5,
    });
    expect(received.status).toBe(200);
    expect(received.body.data).toMatchObject({ stock_quantity: 15, available_quantity: 15, stock_status: "in_stock" });

    const counted = await request(app).post("/adjust").send({
      product: String(variable._id), variation: String(variation._id), mode: "set", quantity: 0, reason: "count_correction",
    });
    expect(counted.status).toBe(200);
    expect(counted.body.data.stock_status).toBe("out_of_stock");
    expect((await Product.findById(variable._id).lean()).stock_status).toBe("out_of_stock");

    expect(await AuditLog.countDocuments({ event: "STOCK_ADJUSTED" })).toBe(2);

    const history = await request(app).get("/transactions").query({ product: String(simple._id) });
    expect(history.status).toBe(200);
    expect(history.body.data.docs[0]).toMatchObject({ delta: 10, balance_after: 15, reason: "received", note: "PO 42", actor_type: "admin" });
    expect(history.body.data.docs[0].product).toMatchObject({ name: "Admin Simple", sku: "ADM-S" });

    const lvls = await request(app).get("/levels").query({ stock_status: "out_of_stock" });
    expect(lvls.status).toBe(200);
    expect(lvls.body.data.docs.map((d) => d.sku)).toEqual(["ADM-V-RED"]);
    expect(lvls.body.data.docs[0]).toMatchObject({ name: "Admin Variable", variation_name: "adm-red", available_quantity: 0 });
  });

  it("returns 409 with current figures when on-hand changed since it was loaded", async () => {
    const res = await request(app).post("/adjust").send({
      product: String(simple._id), quantity: -1, reason: "damage", expected_on_hand: 4,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ code: "STOCK_CHANGED", stock_quantity: 5 });
    expect((await Product.findById(simple._id).lean()).stock_quantity).toBe(5);
  });

  it("rejects unknown reasons and adjusting a variable product directly", async () => {
    expect((await request(app).post("/adjust").send({ product: String(simple._id), quantity: 1, reason: "sale" })).status).toBe(400);
    expect((await request(app).post("/adjust").send({ product: String(variable._id), quantity: 1, reason: "received" })).status).toBe(400);
  });

  it("bulk adjust reports per-row results", async () => {
    const res = await request(app).post("/adjust/bulk").send({ rows: [
      { product: String(simple._id), quantity: 2, reason: "received" },
      { product: String(simple._id), quantity: -100, reason: "loss" },
    ] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ succeeded: 1, failed: 1 });
    expect(res.body.data.results[1]).toMatchObject({ ok: false, status: 400 });
    expect((await Product.findById(simple._id).lean()).stock_quantity).toBe(7);
  });

  it("lists low-stock SKUs by available units", async () => {
    await Product.updateOne({ _id: simple._id }, { $set: { reserved_quantity: 4 } });
    const res = await request(app).get("/levels").query({ low_stock: true });
    expect(res.status).toBe(200);
    expect(res.body.data.docs.map((d) => [d.sku, d.available_quantity]).sort()).toEqual([["ADM-S", 1], ["ADM-V-RED", 1]]);
  });
});
