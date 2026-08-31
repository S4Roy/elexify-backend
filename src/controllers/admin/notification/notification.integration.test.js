import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(
  /\/[^/?]+(\?|$)/,
  "/elexify_admin_notification_integration$1"
);
const suite = uri ? describe : describe.skip;

const { history } = await import("./history.js");
const { deadLetter } = await import("./deadLetter.js");
const { retry } = await import("./retry.js");
const NotificationJob = (await import("../../../models/NotificationJob.js")).default;
const NotificationLog = (await import("../../../models/NotificationLog.js")).default;
const AuditLog = (await import("../../../models/AuditLog.js")).default;
const User = (await import("../../../models/User.js")).default;

const mockRes = () => {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const mockReq = (overrides = {}) => ({
  ip: "127.0.0.1",
  headers: { "user-agent": "vitest" },
  __: (str) => str,
  query: {},
  params: {},
  ...overrides,
});

suite("admin notification history / dead-letter / retry", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await NotificationJob.createIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("lists notification history filtered by event/channel/status, with masked destinations only", async () => {
    const user = await User.create({ role: "customer", name: "Hist User", email: "hist@example.com", status: "active" });
    await NotificationLog.create([
      { user_id: user._id, event: "ORDER_PLACED", channel: "email", destination_masked: "h***@example.com", status: "SENT", attempt_count: 1 },
      { user_id: user._id, event: "ORDER_PLACED", channel: "sms", destination_masked: "+91 ******1111", status: "FAILED", attempt_count: 1 },
      { user_id: user._id, event: "PASSWORD_CHANGED", channel: "email", destination_masked: "h***@example.com", status: "SENT", attempt_count: 1 },
    ]);

    const req = mockReq({ query: { event: "ORDER_PLACED" } });
    const res = mockRes();
    await history(req, res, (err) => {
      throw err;
    });

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.docs).toHaveLength(2);
    expect(payload.data.docs.every((d) => d.event === "ORDER_PLACED")).toBe(true);
    for (const doc of payload.data.docs) {
      expect(doc.destination_masked).not.toMatch(/^h[a-z]+@/); // never the raw local-part
      expect(doc.destination).toBeUndefined(); // no raw field at all
    }
  });

  it("lists only DEAD_LETTER jobs with last_error_safe", async () => {
    const user = await User.create({ role: "customer", name: "DL User", email: "dl@example.com", status: "active" });
    await NotificationJob.create([
      { user_id: user._id, event: "PASSWORD_CHANGED", channel: "email", template_id: "password_changed", status: "SENT" },
      {
        user_id: user._id,
        event: "PASSWORD_CHANGED",
        channel: "sms",
        template_id: "password_changed",
        status: "DEAD_LETTER",
        error_class: "TRANSIENT",
        last_error_safe: "provider timeout",
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    await deadLetter(req, res, (err) => {
      throw err;
    });

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.docs).toHaveLength(1);
    expect(payload.data.docs[0].status).toBe("DEAD_LETTER");
    expect(payload.data.docs[0].last_error_safe).toBe("provider timeout");
  });

  it("manual retry resets a DEAD_LETTER job to RETRYING (due now, attempts reset) and audits actor+reason context", async () => {
    const user = await User.create({ role: "customer", name: "Retry User", email: "retry@example.com", status: "active" });
    const log = await NotificationLog.create({
      user_id: user._id,
      event: "ORDER_SHIPPED",
      channel: "email",
      status: "DEAD_LETTER",
    });
    const job = await NotificationJob.create({
      user_id: user._id,
      event: "ORDER_SHIPPED",
      channel: "email",
      template_id: "order_shipped",
      status: "DEAD_LETTER",
      attempts: 3,
      error_class: "TRANSIENT",
      last_error_safe: "provider timeout",
      notification_log_id: log._id,
    });

    const req = mockReq({ params: { jobId: String(job._id) }, auth: { user_id: String(user._id) } });
    await retry(req, mockRes(), (err) => {
      throw err;
    });

    const reloaded = await NotificationJob.findById(job._id);
    expect(reloaded.status).toBe("RETRYING");
    expect(reloaded.attempts).toBe(0);
    expect(reloaded.next_attempt_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const reloadedLog = await NotificationLog.findById(log._id);
    expect(reloadedLog.status).toBe("RETRYING");

    const audit = await AuditLog.findOne({ event: "NOTIFICATION_MANUAL_RETRY" });
    expect(audit).toBeTruthy();
    expect(audit.metadata.job_id.toString()).toBe(String(job._id));
  });

  it("retry rejects a job that isn't in DEAD_LETTER state", async () => {
    const user = await User.create({ role: "customer", name: "NoRetry", email: "noretry@example.com", status: "active" });
    const job = await NotificationJob.create({
      user_id: user._id,
      event: "ORDER_SHIPPED",
      channel: "email",
      template_id: "order_shipped",
      status: "SENT",
    });

    const req = mockReq({ params: { jobId: String(job._id) } });
    let caught;
    await retry(req, mockRes(), (err) => {
      caught = err;
    });

    expect(caught).toBeTruthy();
    expect(caught.statusCode).toBe(404);
  });
});
