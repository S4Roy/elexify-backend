import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_notification_queue_integration$1"
);
const suite = uri ? describe : describe.skip;

const emailCalls = [];
const smsCalls = [];
vi.mock("../email/index.js", () => ({
  sendEmail: vi.fn((...args) => {
    emailCalls.push(args);
    return Promise.resolve(true);
  }),
}));
vi.mock("../sms/index.js", () => ({
  sendSMS: vi.fn((...args) => {
    smsCalls.push(args);
    return Promise.resolve({ success: true });
  }),
}));
vi.mock("./whatsapp.provider.js", () => ({
  sendTemplate: vi.fn(() => Promise.resolve({ success: false, error: "whatsapp_provider_not_configured" })),
  sendOtp: vi.fn(() => Promise.resolve({ success: false, error: "whatsapp_provider_not_configured" })),
  sendTransactional: vi.fn(() => Promise.resolve({ success: false, error: "whatsapp_provider_not_configured" })),
}));

const { sendNotification } = await import("./sendNotification.js");
const { processNotificationQueue } = await import("./processNotificationQueue.js");
const User = (await import("../../models/User.js")).default;
const NotificationJob = (await import("../../models/NotificationJob.js")).default;
const NotificationLog = (await import("../../models/NotificationLog.js")).default;
const { sendEmail } = await import("../email/index.js");
const { sendSMS } = await import("../sms/index.js");

const createUser = async (overrides = {}) =>
  User.create({
    role: "customer",
    name: "Queue Test User",
    email: "queue.test@example.com",
    email_verified_at: new Date(),
    phone_code: "91",
    mobile: "9000000002",
    mobile_verified_at: new Date(),
    status: "active",
    ...overrides,
  });

suite("notification queue — enqueue + worker", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    emailCalls.length = 0;
    smsCalls.length = 0;
    await mongoose.connection.db.dropDatabase();
    // dropDatabase() also drops indexes — Mongoose only auto-builds them
    // once at model-compile time, not on every write, so the uniqueness
    // guard under test needs to be explicitly rebuilt after each drop.
    await NotificationJob.createIndexes();
    sendEmail.mockImplementation((...args) => {
      emailCalls.push(args);
      return Promise.resolve(true);
    });
    sendSMS.mockImplementation((...args) => {
      smsCalls.push(args);
      return Promise.resolve({ success: true });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("enqueues a NotificationJob + NotificationLog(QUEUED) per eligible channel, without delivering", async () => {
    const user = await createUser();
    const result = await sendNotification({ userId: user._id, event: "PASSWORD_CHANGED", data: {} });

    expect(result.success).toBe(true);
    const jobs = await NotificationJob.find({ user_id: user._id });
    // PASSWORD_CHANGED channels: email, sms — both verified, mandatory.
    expect(jobs.map((j) => j.channel).sort()).toEqual(["email", "sms"]);
    expect(jobs.every((j) => j.status === "QUEUED")).toBe(true);

    const logs = await NotificationLog.find({ user_id: user._id });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === "QUEUED")).toBe(true);

    // No delivery happened yet — enqueue is not the same as sending.
    expect(emailCalls).toHaveLength(0);
    expect(smsCalls).toHaveLength(0);
  });

  it("is idempotent on (user, event, channel, dedupeKey) — a duplicate enqueue is a no-op", async () => {
    const user = await createUser();
    await sendNotification({ userId: user._id, event: "ORDER_CANCELLED", data: {}, dedupeKey: "order_1:ORDER_CANCELLED" });
    await sendNotification({ userId: user._id, event: "ORDER_CANCELLED", data: {}, dedupeKey: "order_1:ORDER_CANCELLED" });

    const jobs = await NotificationJob.find({ user_id: user._id, event: "ORDER_CANCELLED" });
    // ORDER_CANCELLED channels: email, sms — one job per channel, not two.
    expect(jobs).toHaveLength(2);
  });

  it("does not dedupe events with no dedupeKey — each call enqueues fresh jobs", async () => {
    const user = await createUser();
    await sendNotification({ userId: user._id, event: "PASSWORD_CHANGED", data: {} });
    await sendNotification({ userId: user._id, event: "PASSWORD_CHANGED", data: {} });

    const jobs = await NotificationJob.find({ user_id: user._id, event: "PASSWORD_CHANGED" });
    expect(jobs).toHaveLength(4); // 2 channels x 2 calls
  });

  it("never enqueues WhatsApp for an unverified mobile", async () => {
    const user = await createUser({ mobile_verified_at: null, email: "unverified.mobile@example.com" });
    await sendNotification({ userId: user._id, event: "ORDER_PLACED", data: {} });

    const jobs = await NotificationJob.find({ user_id: user._id });
    expect(jobs.some((j) => j.channel === "whatsapp")).toBe(false);
    expect(jobs.some((j) => j.channel === "sms")).toBe(false); // sms is also mobile-gated
  });

  it("worker delivers a QUEUED job and marks it SENT", async () => {
    const user = await createUser();
    await sendNotification({ userId: user._id, event: "PASSWORD_CHANGED", data: {} });

    const results = await processNotificationQueue(10);
    expect(results.every((r) => r.status === "SENT")).toBe(true);

    const jobs = await NotificationJob.find({ user_id: user._id });
    expect(jobs.every((j) => j.status === "SENT")).toBe(true);
    expect(jobs.every((j) => j.attempts === 1)).toBe(true);

    const logs = await NotificationLog.find({ user_id: user._id });
    expect(logs.every((l) => l.status === "SENT")).toBe(true);
    expect(logs.every((l) => l.sent_at)).toBeTruthy();

    expect(emailCalls).toHaveLength(1);
    expect(smsCalls).toHaveLength(1);
  });

  it("retries a transient failure with backoff, then dead-letters after max_attempts", async () => {
    const user = await createUser();
    sendEmail.mockImplementation(() => Promise.resolve(false)); // template_or_delivery_failed -> classified TEMPLATE_ERROR (dead-letters immediately)
    sendSMS.mockImplementation(() => Promise.reject(new Error("ECONNRESET timeout")));

    await sendNotification({ userId: user._id, event: "PASSWORD_CHANGED", data: {} });

    // Attempt 1
    await processNotificationQueue(10);
    const smsJobAfter1 = await NotificationJob.findOne({ user_id: user._id, channel: "sms" });
    expect(smsJobAfter1.status).toBe("RETRYING");
    expect(smsJobAfter1.attempts).toBe(1);
    expect(smsJobAfter1.error_class).toBe("TRANSIENT");
    expect(smsJobAfter1.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 30_000);

    const emailJobAfter1 = await NotificationJob.findOne({ user_id: user._id, channel: "email" });
    expect(emailJobAfter1.status).toBe("DEAD_LETTER");
    expect(emailJobAfter1.error_class).toBe("TEMPLATE_ERROR");

    // Force the SMS job due immediately and process again, twice more, to exhaust max_attempts (3).
    await NotificationJob.updateOne({ _id: smsJobAfter1._id }, { $set: { next_attempt_at: new Date() } });
    await processNotificationQueue(10);
    await NotificationJob.updateOne({ user_id: user._id, channel: "sms" }, { $set: { next_attempt_at: new Date() } });
    await processNotificationQueue(10);

    const smsJobFinal = await NotificationJob.findOne({ user_id: user._id, channel: "sms" });
    expect(smsJobFinal.attempts).toBe(3);
    expect(smsJobFinal.status).toBe("DEAD_LETTER");

    const smsLog = await NotificationLog.findOne({ user_id: user._id, channel: "sms" });
    expect(smsLog.status).toBe("DEAD_LETTER");
  });

  it("classifies a missing-destination failure as INVALID_DESTINATION and dead-letters immediately", async () => {
    const user = await createUser({ email: null, email_verified_at: null });
    // Force-create a job directly (bypassing sendNotification's verified-channel gate) to exercise the worker's own dead-letter classification in isolation.
    const job = await NotificationJob.create({
      user_id: user._id,
      event: "PASSWORD_CHANGED",
      channel: "email",
      template_id: "password_changed",
      data: {},
    });
    const log = await NotificationLog.create({
      user_id: user._id,
      job_id: job._id,
      event: "PASSWORD_CHANGED",
      channel: "email",
      status: "QUEUED",
    });
    await NotificationJob.updateOne({ _id: job._id }, { $set: { notification_log_id: log._id } });

    await processNotificationQueue(5);

    const reloaded = await NotificationJob.findById(job._id);
    expect(reloaded.status).toBe("DEAD_LETTER");
    expect(reloaded.error_class).toBe("INVALID_DESTINATION");
    expect(reloaded.attempts).toBe(1);
  });
});
