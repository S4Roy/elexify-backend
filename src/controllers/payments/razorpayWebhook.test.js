import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { razorpayWebhook } from "./razorpayWebhook.js";
import WebhookLog from "../../models/WebhookLog.js";
import WebhookEvent from "../../models/WebhookEvent.js";
import ReturnRequest from "../../models/ReturnRequest.js";
import Order from "../../models/Order.js";
import { orderService } from "../../services/index.js";
import { recordOperationalEvent } from "../../services/observability/recordOperationalEvent.js";
import { getRazorpayConfig } from "../../services/integrationCredentials/razorpay.js";

vi.mock("../../models/WebhookLog.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../../models/WebhookEvent.js", () => ({ default: { findOne: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), findByIdAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn(), findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ReturnRequest.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../services/index.js", () => ({ orderService: { finalizeCapturedPayment: vi.fn() }, notificationService: { sendOrderNotification: vi.fn() } }));
vi.mock("../../services/observability/recordOperationalEvent.js", () => ({ recordOperationalEvent: vi.fn().mockResolvedValue({}) }));
vi.mock("../../services/integrationCredentials/razorpay.js", () => ({ getRazorpayConfig: vi.fn() }));

const event = { event: "payment.captured", account_id: "acc_test", payload: { payment: { entity: {
  id: "pay_test", order_id: "order_test", status: "captured", amount: 10000, currency: "INR",
  email: "private@example.com", contact: "9999999999", notes: { secret: "private" }, card: { number: "private" }, vpa: "private@bank",
} } } };
const hash = body => crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
const inbox = (body = event) => ({ _id: "inbox", event_id: "evt_test", payload: body, payload_hash: hash(body), status: "received", attempts: 0 });
const deliver = async (body = event, headers = {}) => {
  const rawBody = Buffer.from(JSON.stringify(body));
  const req = { body, rawBody, headers: { "x-razorpay-event-id": "evt_test", "x-razorpay-signature": crypto.createHmac("sha256", "secret").update(rawBody).digest("hex"), ...headers } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await razorpayWebhook(req, res);
  await Promise.resolve();
  return { res, log: WebhookLog.create.mock.calls.at(-1)?.[0] };
};
beforeEach(() => {
  vi.resetAllMocks();
  recordOperationalEvent.mockResolvedValue({});
  getRazorpayConfig.mockResolvedValue({ webhook_secret: "secret", account_id: "acc_test" });
  WebhookLog.create.mockResolvedValue({});
  WebhookEvent.findOne.mockResolvedValue(null);
  WebhookEvent.create.mockImplementation(async data => ({ _id: "inbox", attempts: 0, ...data }));
  WebhookEvent.findOneAndUpdate.mockResolvedValue({ ...inbox(), status: "processing", attempts: 1 });
  WebhookEvent.findByIdAndUpdate.mockResolvedValue({ status: "completed" });
  WebhookEvent.updateOne.mockResolvedValue({});
  Order.findOne.mockResolvedValue({ _id: "local_order", id: "local_order" });
  orderService.finalizeCapturedPayment.mockResolvedValue({ alreadyFinalized: true });
});

describe("Razorpay delivery audit", () => {
  it("logs a successful delivery with correlation and an allowlisted payload", async () => {
    const { res, log } = await deliver();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(WebhookLog.create).toHaveBeenCalledTimes(1);
    expect(log).toMatchObject({ provider: "razorpay", event_id: "evt_test", payment_id: "pay_test", provider_order_id: "order_test", order_id: "local_order", signature_verified: true, outcome: "processed", attempts: 1, processing_state: "completed" });
    expect(log.payload.payload.payment.entity).toEqual({ id: "pay_test", order_id: "order_test", status: "captured", amount: 10000, currency: "INR" });
    expect(JSON.stringify(log)).not.toContain("private");
    expect(log.processing_ms).toBeGreaterThanOrEqual(0);
  });
  it.each([undefined, "bad", "é".repeat(64)])("logs a rejected signature without processing (%s)", async signature => {
    const { res, log } = await deliver(event, { "x-razorpay-signature": signature });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(log).toMatchObject({ signature_verified: false, outcome: "error" });
    expect(WebhookEvent.findOne).not.toHaveBeenCalled();
  });
  it("logs each completed duplicate without replaying it", async () => {
    WebhookEvent.findOne.mockResolvedValue({ ...inbox(), status: "completed", attempts: 1 });
    await deliver();
    const { res, log } = await deliver();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(WebhookLog.create).toHaveBeenCalledTimes(2);
    expect(log).toMatchObject({ duplicate: true, outcome: "ignored", processing_state: "completed" });
    expect(WebhookEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("correlates refund deliveries to the local order", async () => {
    const body = { event: "refund.processed", account_id: "acc_test", payload: { refund: { entity: { id: "rfnd_test", payment_id: "pay_test", status: "processed", amount: 5000, notes: { private: true } } } } };
    const save = vi.fn().mockResolvedValue({});
    ReturnRequest.findOne.mockResolvedValue({ order_id: "local_order", refund: { amount: 50 }, save });
    Order.findById.mockResolvedValue(null);
    WebhookEvent.findOneAndUpdate.mockResolvedValue({ ...inbox(body), attempts: 1 });
    const { log } = await deliver(body);
    expect(log).toMatchObject({ refund_id: "rfnd_test", payment_id: "pay_test", order_id: "local_order", outcome: "processed" });
    expect(log.payload.payload.refund.entity).not.toHaveProperty("notes");
    expect(save).toHaveBeenCalledOnce();
  });
  it("rejects a conflicting concurrent insertion without replaying it", async () => {
    WebhookEvent.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...inbox(), payload_hash: "different" });
    WebhookEvent.create.mockRejectedValue({ code: 11000 });
    const { res, log } = await deliver();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(log).toMatchObject({ duplicate: true, outcome: "error", outcome_detail: "Event payload mismatch" });
    expect(WebhookEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("logs payload conflicts", async () => {
    WebhookEvent.findOne.mockResolvedValue({ ...inbox(), payload_hash: "different" });
    const { res, log } = await deliver();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(log.outcome_detail).toBe("Event payload mismatch");
  });
  it("logs unsupported events as ignored", async () => {
    const body = { ...event, event: "payment.authorized" };
    WebhookEvent.findOneAndUpdate.mockResolvedValue({ ...inbox(body), attempts: 1 });
    const { res, log } = await deliver(body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(log.outcome).toBe("ignored");
    expect(orderService.finalizeCapturedPayment).not.toHaveBeenCalled();
  });
  it("logs account mismatch and credential unavailability", async () => {
    const { log } = await deliver({ ...event, account_id: "other" });
    expect(log).toMatchObject({ status_code: 400, signature_verified: true, outcome_detail: "Webhook account mismatch" });
    getRazorpayConfig.mockRejectedValue(new Error("secret"));
    const unavailable = await deliver();
    expect(unavailable.log).toMatchObject({ status_code: 503, signature_verified: null });
  });
  it.each([1, 5])("captures retry state after processing attempt %s fails", async attempts => {
    WebhookEvent.findOneAndUpdate.mockResolvedValue({ ...inbox(), attempts });
    Order.findOne.mockRejectedValue(new Error("database unavailable"));
    const { res, log } = await deliver();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(log).toMatchObject({ outcome: "error", attempts, processing_state: attempts === 5 ? "dead_letter" : "failed" });
    expect(log.next_retry_at).toEqual(attempts === 5 ? null : expect.any(Date));
  });
  it("preserves successful responses if audit storage fails", async () => {
    WebhookLog.create.mockRejectedValue(new Error("unavailable"));
    const { res } = await deliver();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
