import NotificationLog from "../../../models/NotificationLog.js";
import { createHash, randomUUID } from "node:crypto";
import DeviceToken from "../../../models/DeviceToken.js";
import PushNotification from "../../../models/PushNotification.js";
import PushDelivery from "../../../models/PushDelivery.js";
import PushCampaign from "../../../models/PushCampaign.js";
import NotificationJob from "../../../models/NotificationJob.js";
import NotificationPreference from "../../../models/NotificationPreference.js";
import { pushConfig, eligibleEnvironmentUser } from "./config.js";
import { resolvePushTemplate } from "./templates.js";
import { sendFcm } from "./fcm.js";

export async function registerDevice(userId, input) {
  const c = await pushConfig();
  if (
    !c.enabled ||
    input.environment !== c.environment ||
    input.firebase_project_id !== c.projectId
  )
    throw new Error("Push configuration does not match this app.");
  const hash = createHash("sha256").update(input.token).digest("hex");
  // Token belongs to one installation. Never silently transfer a token to a different installation.
  const clash = await DeviceToken.exists({
    environment: c.environment,
    token_hash: hash,
    device_id: { $ne: input.device_id },
  });
  if (clash)
    throw new Error("Token is already registered to another installation.");
  const count = await DeviceToken.countDocuments({
    user_id: userId,
    environment: c.environment,
    is_active: true,
    device_id: { $ne: input.device_id },
  });
  if (count >= 20)
    throw new Error("Device limit reached. Remove an old device first.");
  return DeviceToken.findOneAndUpdate(
    { environment: c.environment, device_id: input.device_id },
    {
      $set: {
        user_id: userId,
        token: input.token,
        token_hash: hash,
        project_id: c.projectId,
        platform: input.platform,
        app_version: input.app_version,
        is_active: true,
        last_seen_at: new Date(),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}
export async function persistPush(
  userId,
  content,
  { dedupeKey, campaignId, expiresAt } = {}
) {
  const c = await pushConfig();
  if (!(await eligibleEnvironmentUser(userId, c))) return null;
  const values = {
    user_id: userId,
    ...content,
    environment: c.environment,
    campaign_id: campaignId || null,
    dedupe_key: dedupeKey || randomUUID(),
    expires_at: expiresAt || new Date(Date.now() + 30 * 86400000),
  };
  try {
    return await PushNotification.findOneAndUpdate(
      { user_id: userId, dedupe_key: values.dedupe_key },
      { $setOnInsert: values },
      { upsert: true, new: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return null;
  }
}
export async function enqueuePushEvent({
  userId,
  event,
  data,
  dedupeKey,
  category,
}) {
  const template = resolvePushTemplate(event, data);
  if (!template || !(await eligibleEnvironmentUser(userId))) return;
  await persistPush(
    userId,
    {
      ...template,
      category,
      priority: category === "marketing" ? "normal" : "high",
    },
    { dedupeKey: dedupeKey ? `${event}:${dedupeKey}` : undefined }
  );
}
// Inbox is the durable outbox. Mark queued only after the uniquely indexed job exists.
export async function repairPushOutbox(batchSize = 100) {
  const c = await pushConfig();
  if (!c.enabled) return;
  const rows = await PushNotification.find({
    environment: c.environment,
    queued: false,
    expires_at: { $gt: new Date() },
  })
    .sort({ _id: 1 })
    .limit(batchSize)
    .lean();
  // A customer with no active device (never granted permission, revoked it,
  // or signed out) can't receive a push. Keep the inbox row, but mark it
  // queued without creating a job that could only dead-letter.
  const reachable = new Set(
    (
      await DeviceToken.distinct("user_id", {
        user_id: { $in: [...new Set(rows.map((row) => row.user_id))] },
        environment: c.environment,
        project_id: c.projectId,
        is_active: true,
      })
    ).map(String)
  );
  for (const row of rows) {
    if (!reachable.has(String(row.user_id))) {
      await PushNotification.updateOne(
        { _id: row._id },
        { $set: { queued: true } }
      );
      continue;
    }
    const filter = {
      user_id: row.user_id,
      channel: "push",
      event: row.type,
      dedupe_key: String(row._id),
    };
    try {
      // Log must exist before a worker can claim the job. Shared IDs make every repair idempotent.
      await NotificationLog.updateOne(
        { _id: row._id },
        {
          $setOnInsert: {
            job_id: row._id,
            user_id: row.user_id,
            event: row.type,
            channel: "push",
            provider: "fcm",
            status: "QUEUED",
          },
        },
        { upsert: true }
      );
      await NotificationJob.updateOne(
        filter,
        {
          $setOnInsert: {
            ...filter,
            _id: row._id,
            notification_log_id: row._id,
            template_id: row.type,
            provider: "fcm",
            campaign_id: row.campaign_id,
            environment: c.environment,
            data: { notification_id: String(row._id) },
          },
        },
        { upsert: true }
      );
      await PushNotification.updateOne(
        { _id: row._id },
        { $set: { queued: true } }
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
}
export async function deliverPush({ user, data, job }) {
  const c = await pushConfig();
  if (!c.enabled) return { success: false, error: "push_disabled" };
  const n = await PushNotification.findOne({
    _id: data.notification_id,
    user_id: user._id,
    environment: c.environment,
  }).lean();
  if (!n || n.expires_at <= new Date() || user.status !== "active")
    return { success: false, error: "push_permanent" };
  if (n.category === "marketing") {
    const consent = await NotificationPreference.exists({
      user_id: user._id,
      "marketing.push": true,
    });
    const cancelled =
      n.campaign_id &&
      (await PushCampaign.exists({ _id: n.campaign_id, status: "CANCELLED" }));
    if (!consent || cancelled)
      return { success: false, error: "push_permanent" };
  }
  const devices = DeviceToken.find({
    user_id: user._id,
    environment: c.environment,
    project_id: c.projectId,
    is_active: true,
  })
    .select("user_id environment project_id token token_hash")
    .lean()
    .cursor();
  let retry = false,
    failed = false,
    retryAfterMs = 0,
    deviceCount = 0;
  const submitBatch = async (batch) => {
    if (job) {
      const lease = await NotificationJob.updateOne(
        { _id: job._id, status: "SENDING", lease_id: job.lease_id },
        { $set: { lease_until: new Date(Date.now() + 5 * 60000) } }
      );
      if (!lease.matchedCount) throw new Error("push_lease_lost");
    }
    if (
      n.category === "marketing" &&
      (!(await NotificationPreference.exists({
        user_id: user._id,
        "marketing.push": true,
      })) ||
        (n.campaign_id &&
          (await PushCampaign.exists({
            _id: n.campaign_id,
            status: "CANCELLED",
          }))))
    ) {
      failed = true;
      return;
    }
    const outcomes = await Promise.allSettled(
      batch.map(async (device) => {
        const d = await PushDelivery.findOneAndUpdate(
          { notification_id: n._id, device_id: device._id },
          {
            $setOnInsert: {
              user_id: user._id,
              campaign_id: n.campaign_id,
              token_hash: device.token_hash,
            },
          },
          { upsert: true, new: true }
        );
        if (d.status !== "PENDING") {
          if (d.status === "FAILED" || d.status === "SKIPPED") failed = true;
          return;
        }
        // Recheck ownership immediately before submission, and never send old queued data to a new account.
        const current = await DeviceToken.exists({
          _id: device._id,
          user_id: user._id,
          is_active: true,
          token_hash: device.token_hash,
        });
        if (!current) {
          failed = true;
          await PushDelivery.updateOne(
            { _id: d._id },
            { $set: { status: "SKIPPED", error_code: "DEVICE_CHANGED" } }
          );
          return;
        }
        const outcome = await sendFcm(device, n);
        const exhausted = d.attempts + 1 >= 3;
        const status = outcome.success
          ? "SUBMITTED"
          : outcome.retry && !exhausted
          ? "PENDING"
          : "FAILED";
        await PushDelivery.updateOne(
          { _id: d._id },
          {
            $inc: { attempts: 1 },
            $set: {
              status,
              error_code: outcome.code || null,
              provider_message_id: outcome.messageId || null,
              ...(outcome.success
                ? { submitted_at: new Date() }
                : { failed_at: new Date() }),
            },
          }
        );
        if (outcome.invalid)
          await DeviceToken.updateOne(
            { _id: device._id, token_hash: device.token_hash },
            { $set: { is_active: false } }
          );
        retryAfterMs = Math.max(retryAfterMs, outcome.retryAfterMs || 0);
        retry ||= status === "PENDING";
        failed ||= status === "FAILED";
        console.info(
          JSON.stringify({
            event: "push_submission",
            notification_id: String(n._id),
            type: n.type,
            campaign_id: n.campaign_id,
            user_id: String(user._id),
            status,
            retry_count: d.attempts + 1,
            failure_category: outcome.code || null,
          })
        );
      })
    );
    // Finish every in-flight submission before releasing the job for retry.
    // Database errors must not expose token-bearing query details in logs.
    if (outcomes.some((outcome) => outcome.status === "rejected"))
      throw new Error("push_batch_persistence_failed");
  };
  let batch = [];
  try {
    for await (const device of devices) {
      deviceCount++;
      batch.push(device);
      if (batch.length === 5) {
        await submitBatch(batch);
        batch = [];
      }
    }
    if (batch.length) await submitBatch(batch);
  } finally {
    await devices.close();
  }
  // A failed token may have been deactivated on a previous attempt and no
  // longer appear in the active-device cursor. Keep its terminal outcome in
  // the recipient result, including when another device succeeds on retry.
  failed ||= !!(await PushDelivery.exists({
    notification_id: n._id,
    status: { $in: ["FAILED", "SKIPPED"] },
  }));
  if (!deviceCount) return { success: false, error: "push_permanent" };
  return retry
    ? { success: false, error: "push_transient", retryAfterMs }
    : failed
    ? { success: false, error: "push_permanent" }
    : { success: true };
}
