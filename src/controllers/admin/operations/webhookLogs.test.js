import { beforeEach, expect, it, vi } from "vitest";
import { list } from "./webhookLogs.js";
import WebhookLog from "../../../models/WebhookLog.js";
import Order from "../../../models/Order.js";
vi.mock("../../../models/WebhookLog.js", () => ({ default: { aggregate: vi.fn(), aggregatePaginate: vi.fn() } }));
vi.mock("../../../models/Order.js", () => ({ default: { find: vi.fn(), findOne: vi.fn() } }));
const lean = (value) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });
vi.mock("../../../config/index.js", () => ({ envs: { pagination: { limit: 10 } }, StatusError: {} }));
beforeEach(() => vi.clearAllMocks());
it("searches Razorpay references exactly and excludes payloads from list results", async () => {
  WebhookLog.aggregate.mockReturnValue({});
  WebhookLog.aggregatePaginate.mockResolvedValue({ docs: [], totalDocs: 0 });
  const req = { query: { provider: "razorpay", search: "pay_test", page: 2, limit: 25 }, __: value => value };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await list(req, res, next);
  expect(next).not.toHaveBeenCalled();
  const pipeline = WebhookLog.aggregate.mock.calls[0][0];
  expect(pipeline[0].$match.provider).toBe("razorpay");
  expect(pipeline[0].$match.$or).toEqual(expect.arrayContaining([{ event_id: "pay_test" }, { provider_order_id: "pay_test" }, { payment_id: "pay_test" }, { refund_id: "pay_test" }]));
  expect(pipeline[2].$project).toMatchObject({ payment_id: 1, signature_verified: 1, processing_state: 1 });
  expect(pipeline[2].$project).not.toHaveProperty("payload");
  expect(WebhookLog.aggregatePaginate).toHaveBeenCalledWith(expect.anything(), { page: 2, limit: 25 });
});

it("links rows to their order whether the log stored the order number or the _id", async () => {
  const oid = "64f1c2a9b8e7d6c5b4a3f2e1";
  WebhookLog.aggregate.mockReturnValue({});
  WebhookLog.aggregatePaginate.mockResolvedValue({ docs: [{ order_id: "ORD-000152" }, { order_id: oid }, { order_id: "unknown" }, { order_id: null }] });
  Order.find.mockReturnValue(lean([{ _id: oid, id: "ORD-000152" }]));
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await list({ query: {}, __: (v) => v }, res, vi.fn());
  const docs = res.json.mock.calls[0][0].data.docs;
  expect(docs.map((d) => d.order)).toEqual([{ _id: oid, id: "ORD-000152" }, { _id: oid, id: "ORD-000152" }, null, null]);
});

it("an order-number search also matches rows stored by _id", async () => {
  WebhookLog.aggregate.mockReturnValue({});
  WebhookLog.aggregatePaginate.mockResolvedValue({ docs: [] });
  Order.findOne.mockReturnValue(lean({ _id: "64f1c2a9b8e7d6c5b4a3f2e1" }));
  await list({ query: { search: "ord-000152" }, __: (v) => v }, { status: vi.fn().mockReturnThis(), json: vi.fn() }, vi.fn());
  expect(Order.findOne).toHaveBeenCalledWith({ id: "ORD-000152" });
  expect(WebhookLog.aggregate.mock.calls[0][0][0].$match.$or).toEqual(expect.arrayContaining([{ order_id: "64f1c2a9b8e7d6c5b4a3f2e1" }]));
});
