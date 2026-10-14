import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { errors } from "celebrate";
vi.mock("../../../../services/buyAgain/index.js", () => ({ previewBuyAgain: vi.fn(), addBuyAgain: vi.fn() }));
import { previewBuyAgain, addBuyAgain } from "../../../../services/buyAgain/index.js";
import { buyAgainPreview, buyAgainAdd } from "./buyAgain.js";
import * as validation from "../../../../validations/site/inventory/order/buyAgain.js";
const orderId = "111111111111111111111111";
const lineId = "222222222222222222222222";
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.auth = { user_id: "customer-1" }; next(); });
app.get("/buy-again", validation.buyAgainPreview, buyAgainPreview);
app.post("/buy-again", validation.buyAgainAdd, buyAgainAdd);
app.use(errors());
app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
beforeEach(() => {
  vi.clearAllMocks();
  previewBuyAgain.mockResolvedValue({ items: [], currency: "INR" });
  addBuyAgain.mockResolvedValue({ results: [], currency: "INR" });
});
describe("buy again HTTP contract", () => {
  it("passes authenticated customer and order to the preview", async () => {
    const response = await request(app).get("/buy-again").query({ order_id: orderId });
    expect(response.status).toBe(200);
    expect(previewBuyAgain).toHaveBeenCalledWith("customer-1", orderId);
  });
  it("passes selected historical line IDs and quantities without client prices", async () => {
    const items = [{ order_item_id: lineId, quantity: 2 }];
    const response = await request(app).post("/buy-again").send({ order_id: orderId, items });
    expect(response.status).toBe(200);
    expect(addBuyAgain).toHaveBeenCalledWith("customer-1", orderId, items);
  });
  it.each([0, -1, 1.5, 100001])("rejects invalid quantity %s before mutation", async (quantity) => {
    expect((await request(app).post("/buy-again").send({ order_id: orderId, items: [{ order_item_id: lineId, quantity }] })).status).toBe(400);
    expect(addBuyAgain).not.toHaveBeenCalled();
  });
  it("rejects duplicate selected lines", async () => {
    expect((await request(app).post("/buy-again").send({ order_id: orderId, items: [{ order_item_id: lineId, quantity: 1 }, { order_item_id: lineId, quantity: 2 }] })).status).toBe(400);
    expect(addBuyAgain).not.toHaveBeenCalled();
  });
  it("rejects empty selections and malformed IDs", async () => {
    expect((await request(app).post("/buy-again").send({ order_id: orderId, items: [] })).status).toBe(400);
    expect((await request(app).get("/buy-again").query({ order_id: "bad-id" })).status).toBe(400);
  });
  it("rejects caller-provided prices", async () => {
    expect((await request(app).post("/buy-again").send({ order_id: orderId, items: [{ order_item_id: lineId, quantity: 1, price: 1 }] })).status).toBe(400);
    expect(addBuyAgain).not.toHaveBeenCalled();
  });
  it("propagates ownership errors", async () => {
    previewBuyAgain.mockRejectedValueOnce(Object.assign(new Error("Order not found."), { statusCode: 404 }));
    expect((await request(app).get("/buy-again").query({ order_id: orderId })).status).toBe(404);
  });
});
