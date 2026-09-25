import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import { errors } from "celebrate";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("./fcm.js", () => ({
  sendFcm: vi.fn(async () => ({ success: true, messageId: "mock-accepted" })),
}));
vi.mock("../../rbac/authorization.js", () => ({
  resolveAuthorization: vi.fn(async (req) => ({
    permissions: new Set((req.headers["x-permissions"] || "").split(",")),
  })),
}));
import { sendFcm } from "./fcm.js";
import DeviceToken from "../../../models/DeviceToken.js";
import PushNotification from "../../../models/PushNotification.js";
import PushDelivery from "../../../models/PushDelivery.js";
import PushCampaign from "../../../models/PushCampaign.js";
import NotificationPreference from "../../../models/NotificationPreference.js";
import NotificationJob from "../../../models/NotificationJob.js";
import NotificationLog from "../../../models/NotificationLog.js";
import User from "../../../models/User.js";
import {
  registerDevice,
  enqueuePushEvent,
  repairPushOutbox,
  deliverPush,
  persistPush,
} from "./service.js";
import { processCampaigns, campaignStats } from "./campaigns.js";
import { processNotificationQueue } from "../processNotificationQueue.js";
import {
  deviceTokensRouter,
  userNotificationsRouter,
} from "../../../routes/user/notifications.js";
import { pushCampaignsRouter } from "../../../routes/admin/pushCampaigns.js";
const uri = process.env.PUSH_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const models = [
  DeviceToken,
  PushNotification,
  PushDelivery,
  PushCampaign,
  NotificationPreference,
  NotificationJob,
  NotificationLog,
  User,
];
let user, other;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.auth = req.headers["x-user"] ? { user_id: req.headers["x-user"] } : null;
  next();
});
app.use("/devices", deviceTokensRouter);
app.use("/inbox", userNotificationsRouter);
app.use("/campaigns", pushCampaignsRouter);
app.use(errors());
app.use((e, req, res, next) =>
  res.status(e.statusCode || 500).json({ message: e.message })
);
const input = (suffix = "1") => ({
  token: `test-token-${suffix}`.padEnd(30, "x"),
  device_id: `installation-${suffix}`.padEnd(20, "x"),
  platform: "android",
  environment: "staging",
  firebase_project_id: "stage",
});
const content = {
  type: "PROMOTIONAL_CAMPAIGN",
  category: "marketing",
  title: "Sale",
  body: "Open Elexify",
  route: "/products",
};
const permissions = [
  "view",
  "create",
  "send",
  "schedule",
  "cancel",
  "analytics",
]
  .map((p) => `customer.notification.${p}`)
  .join(",");
suite("push platform (isolated MongoDB, mocked FCM)", () => {
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:27129\/elexify_push_test$/.test(uri))
      throw new Error("Use the dedicated isolated test database.");
    await mongoose.connect(uri, { autoIndex: false });
    for (const m of models) await m.createIndexes();
  });
  beforeEach(async () => {
    for (const m of models) await m.deleteMany({});
    vi.stubEnv("PUSH_ENABLED", "true");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("FCM_ENVIRONMENT", "staging");
    vi.stubEnv("FCM_PROJECT_ID", "stage");
    vi.stubEnv("FCM_PRODUCTION_PROJECT_ID", "prod");
    vi.stubEnv("PUSH_CONFIRMATION_SECRET", "x".repeat(32));
    user = await User.create({ name: "Push test", role: "customer" });
    other = await User.create({ name: "Other", role: "customer" });
    vi.stubEnv("PUSH_TEST_USER_IDS", `${user._id},${other._id}`);
    sendFcm
      .mockReset()
      .mockResolvedValue({ success: true, messageId: "mock-accepted" });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await mongoose.disconnect();
  });
  it("registers idempotently, rotates, rejects duplicated tokens, and reassigns an installation", async () => {
    const a = await registerDevice(user._id, input());
    const b = await registerDevice(user._id, input());
    expect(String(a._id)).toBe(String(b._id));
    await expect(
      registerDevice(user._id, { ...input("2"), token: input().token })
    ).rejects.toThrow("another installation");
    await registerDevice(user._id, {
      ...input(),
      token: "rotated-token".padEnd(30, "x"),
    });
    expect(await DeviceToken.countDocuments()).toBe(1);
    await registerDevice(other._id, input());
    expect(await DeviceToken.countDocuments({ user_id: user._id })).toBe(0);
    expect((await DeviceToken.findOne()).token).toBeUndefined();
  });
  it("requires auth and scopes token removal to owner", async () => {
    await request(app).post("/devices").send(input()).expect(401);
    await request(app)
      .post("/devices")
      .set("x-user", String(user._id))
      .send(input())
      .expect(200);
    await request(app)
      .delete(`/devices/${input().device_id}`)
      .set("x-user", String(other._id))
      .expect(200);
    expect((await DeviceToken.findOne()).is_active).toBe(true);
    await request(app)
      .delete(`/devices/${input().device_id}`)
      .set("x-user", String(user._id))
      .expect(200);
    expect((await DeviceToken.findOne()).is_active).toBe(false);
  });
  it("deduplicates business events, recovers outbox and creates a single job/log", async () => {
    const event = {
      userId: user._id,
      event: "ORDER_PLACED",
      data: { order_id: "ORD-1" },
      dedupeKey: "ORD-1:placed",
      category: "transactional",
    };
    await Promise.all([enqueuePushEvent(event), enqueuePushEvent(event)]);
    expect(await PushNotification.countDocuments()).toBe(1);
    await repairPushOutbox();
    await repairPushOutbox();
    expect(await NotificationJob.countDocuments()).toBe(1);
    expect(await NotificationLog.countDocuments()).toBe(1);
  });
  it("inbox pagination and reads never expose another customer record", async () => {
    const n = await persistPush(user._id, {
      ...content,
      category: "transactional",
    });
    await persistPush(user._id, { ...content, category: "transactional" });
    await request(app)
      .get(`/inbox/${n._id}`)
      .set("x-user", String(other._id))
      .expect(404);
    await request(app)
      .patch(`/inbox/${n._id}/read`)
      .set("x-user", String(other._id))
      .expect(404);
    const list = await request(app)
      .get("/inbox?limit=1")
      .set("x-user", String(user._id))
      .expect(200);
    expect(list.body.data.next_cursor).toBeTruthy();
    await request(app)
      .patch(`/inbox/${n._id}/read`)
      .set("x-user", String(user._id))
      .expect(200);
    expect(
      (
        await request(app)
          .get("/inbox/unread-count")
          .set("x-user", String(user._id))
      ).body.data.count
    ).toBe(1);
    await request(app)
      .patch("/inbox/read-all")
      .set("x-user", String(user._id))
      .expect(200);
    expect(
      (
        await request(app)
          .get("/inbox/unread-count")
          .set("x-user", String(user._id))
      ).body.data.count
    ).toBe(0);
  });
  it("does not resend accepted devices; retries transient failures and deactivates invalid tokens", async () => {
    await registerDevice(user._id, input());
    await registerDevice(user._id, input("2"));
    const n = await persistPush(user._id, {
      ...content,
      category: "transactional",
    });
    sendFcm
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: false,
        code: "UNAVAILABLE",
        retry: true,
      });
    expect(
      await deliverPush({ user, data: { notification_id: n._id } })
    ).toMatchObject({ error: "push_transient" });
    sendFcm.mockResolvedValueOnce({
      success: false,
      code: "UNREGISTERED",
      invalid: true,
      retry: false,
    });
    expect(
      await deliverPush({ user, data: { notification_id: n._id } })
    ).toMatchObject({ error: "push_permanent" });
    expect(sendFcm).toHaveBeenCalledTimes(3);
    expect(await DeviceToken.countDocuments({ is_active: true })).toBe(1);
    expect(await PushDelivery.countDocuments({ status: "SUBMITTED" })).toBe(1);
  });
  it("worker retries with backoff, stops at max attempts and recovers expired leases", async () => {
    await registerDevice(user._id, input());
    const n = await persistPush(user._id, {
      ...content,
      category: "transactional",
    });
    await repairPushOutbox();
    sendFcm.mockResolvedValue({
      success: false,
      code: "UNAVAILABLE",
      retry: true,
    });
    await processNotificationQueue(1);
    let job = await NotificationJob.findOne();
    expect(job.status).toBe("RETRYING");
    expect(job.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    await NotificationJob.updateOne(
      { _id: job._id },
      { $set: { status: "SENDING", lease_until: new Date(0) } }
    );
    await processNotificationQueue(1);
    job = await NotificationJob.findOne();
    expect(job.attempts).toBe(2);
    await NotificationJob.updateOne(
      { _id: job._id },
      { $set: { next_attempt_at: new Date(0) } }
    );
    await processNotificationQueue(1);
    expect((await NotificationJob.findOne()).status).toBe("DEAD_LETTER");
    expect(sendFcm).toHaveBeenCalledTimes(3);
  });
  it("retains an invalid device failure when the remaining device succeeds on retry", async () => {
    await registerDevice(user._id, input());
    await registerDevice(user._id, input("2"));
    await persistPush(user._id, { ...content, category: "transactional" });
    await repairPushOutbox();
    sendFcm.mockResolvedValueOnce({
      success: false, code: "UNREGISTERED", invalid: true, retry: false,
    }).mockResolvedValueOnce({
      success: false, code: "UNAVAILABLE", retry: true,
    });
    await processNotificationQueue(1);
    const job = await NotificationJob.findOne();
    expect(job.status).toBe("RETRYING");
    await NotificationJob.updateOne({ _id: job._id }, {
      $set: { next_attempt_at: new Date(0) },
    });
    await processNotificationQueue(1);
    expect(sendFcm).toHaveBeenCalledTimes(3);
    expect(await PushDelivery.countDocuments({ status: "SUBMITTED" })).toBe(1);
    expect(await PushDelivery.countDocuments({ status: "FAILED" })).toBe(1);
    expect((await NotificationJob.findOne()).status).toBe("DEAD_LETTER");
    expect((await NotificationLog.findOne()).status).toBe("DEAD_LETTER");
  });
  it("waits for in-flight sends before returning a safe persistence error", async () => {
    await registerDevice(user._id, input());
    await registerDevice(user._id, input("2"));
    const n = await persistPush(user._id, { ...content, category: "transactional" });
    let release, observeFailure;
    const failedWrite = new Promise(resolve => { observeFailure = resolve; });
    sendFcm.mockResolvedValueOnce({ success: true }).mockImplementationOnce(
      () => new Promise(resolve => { release = resolve; })
    );
    const write = vi.spyOn(PushDelivery, "updateOne").mockImplementationOnce(async () => {
      observeFailure();
      throw new Error("database query with secret token");
    });
    let finished = false;
    const delivery = deliverPush({ user, data: { notification_id: n._id } });
    const result = delivery.then(
      value => { finished = true; return value; },
      error => { finished = true; return error.message; }
    );
    try {
      await failedWrite;
      // Both devices share the same batch; the first write must not end it.
      await new Promise(resolve => setImmediate(resolve));
      expect(finished).toBe(false);
      // Wait until the second mocked provider request has started.
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      release({ success: true });
      expect(await result).toBe("push_batch_persistence_failed");
      expect(await PushDelivery.countDocuments({ status: "SUBMITTED" })).toBe(1);
    } finally {
      release?.({ success: true });
      write.mockRestore();
    }
  });
  it("honors marketing revocation, cancelled campaigns, and changed device ownership", async () => {
    await registerDevice(user._id, input());
    const n = await persistPush(user._id, content);
    expect(
      await deliverPush({ user, data: { notification_id: n._id } })
    ).toMatchObject({ error: "push_permanent" });
    expect(sendFcm).not.toHaveBeenCalled();
    await NotificationPreference.create({
      user_id: user._id,
      marketing: { push: true },
    });
    await registerDevice(other._id, input());
    await deliverPush({ user, data: { notification_id: n._id } });
    expect(sendFcm).not.toHaveBeenCalled();
  });
  it("guards campaign permissions and confirms an idempotent, consent-targeted campaign", async () => {
    await registerDevice(user._id, input());
    await registerDevice(other._id, input("2"));
    await NotificationPreference.create({
      user_id: user._id,
      marketing: { push: true },
    });
    await NotificationPreference.create({ user_id: other._id });
    const payload = {
      title: "Sale",
      body: "Browse",
      route: "/products",
      audience: "all",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    await request(app)
      .post("/campaigns")
      .set("x-user", String(user._id))
      .send(payload)
      .expect(403);
    const r = await request(app)
      .post("/campaigns")
      .set("x-user", String(user._id))
      .set("x-permissions", permissions)
      .send(payload)
      .expect(200);
    const id = r.body.data.campaign._id;
    const preview = await request(app)
      .post(`/campaigns/${id}/preview`)
      .set("x-user", String(user._id))
      .set("x-permissions", permissions)
      .expect(200);
    expect(preview.body.data.recipient_count).toBe(1);
    const body = { confirmation: preview.body.data.confirmation };
    await request(app)
      .post(`/campaigns/${id}/send`)
      .set("x-user", String(user._id))
      .set("x-permissions", "customer.notification.view")
      .send(body)
      .expect(403);
    for (let i = 0; i < 2; i++)
      await request(app)
        .post(`/campaigns/${id}/send`)
        .set("x-user", String(user._id))
        .set("x-permissions", permissions)
        .send(body)
        .expect(200);
    await processCampaigns();
    await repairPushOutbox();
    await processNotificationQueue(10);
    await processCampaigns();
    expect(await PushNotification.countDocuments()).toBe(1);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect((await PushCampaign.findById(id)).status).toBe("COMPLETED");
    const stats = await campaignStats(new mongoose.Types.ObjectId(id));
    expect(stats.submissions.SUBMITTED).toBe(1);
    expect(stats.read).toBe(0);
  });
  it("central event entry persists push even without verified email/mobile and never sends synchronously", async () => {
    const { sendNotification } = await import("../sendNotification.js");
    const result = await sendNotification({
      userId: user._id,
      event: "ORDER_SHIPPED",
      data: { order_id: "ORD-2" },
      dedupeKey: "shipped:2",
    });
    expect(result.success).toBe(true);
    expect(await PushNotification.countDocuments()).toBe(1);
    expect(sendFcm).not.toHaveBeenCalled();
  });
  it("concurrent queue workers claim a push job once", async () => {
    await registerDevice(user._id, input());
    await persistPush(user._id, { ...content, category: "transactional" });
    await repairPushOutbox();
    await Promise.all([
      processNotificationQueue(1),
      processNotificationQueue(1),
    ]);
    expect(sendFcm).toHaveBeenCalledTimes(1);
    expect((await NotificationLog.findOne()).status).toBe("SENT");
  });
  it("scheduled campaigns stay pending until due and cancellation prevents queued submissions", async () => {
    await registerDevice(user._id, input());
    await NotificationPreference.create({
      user_id: user._id,
      marketing: { push: true },
    });
    const campaign = await PushCampaign.create({
      ...content,
      audience: "specific",
      customer_ids: [user._id],
      environment: "staging",
      created_by: user._id,
      status: "SCHEDULED",
      scheduled_at: new Date(Date.now() + 60000),
      expires_at: new Date(Date.now() + 86400000),
    });
    await processCampaigns();
    expect(await PushNotification.countDocuments()).toBe(0);
    await PushCampaign.updateOne(
      { _id: campaign._id },
      { $set: { scheduled_at: new Date(0) } }
    );
    await processCampaigns();
    expect(await PushNotification.countDocuments()).toBe(1);
    await request(app)
      .post(`/campaigns/${campaign._id}/cancel`)
      .set("x-user", String(user._id))
      .set("x-permissions", permissions)
      .expect(200);
    await repairPushOutbox();
    await processNotificationQueue(5);
    expect(sendFcm).not.toHaveBeenCalled();
    expect(
      (await PushCampaign.findById(campaign._id)).cancelled_by.toString()
    ).toBe(user._id.toString());
  });
  it("environment-disabled workers leave pending push jobs untouched", async () => {
    await registerDevice(user._id, input());
    await persistPush(user._id, { ...content, category: "transactional" });
    await repairPushOutbox();
    vi.stubEnv("PUSH_ENABLED", "false");
    await processNotificationQueue(1);
    expect((await NotificationJob.findOne()).attempts).toBe(0);
    expect(sendFcm).not.toHaveBeenCalled();
  });
});
