import { pushConfig } from './push/config.js';
import { randomUUID } from 'node:crypto';
import { deliverPush, repairPushOutbox } from './push/service.js';
import { processCampaigns } from './push/campaigns.js';
import NotificationJob from "../../models/NotificationJob.js";
import NotificationLog from "../../models/NotificationLog.js";
import User from "../../models/User.js";
import { emailService, smsService, smsTemplateService } from "../index.js";
import * as whatsappProvider from "./whatsapp.provider.js";
import { classifyNotificationError } from "./classifyNotificationError.js";

// attempts: 1 -> 1min, 2 -> 5min, 3 -> 15min, beyond -> 15min flat (should
// never be reached since max_attempts defaults to 3).
const BACKOFF_MS = { 1: 60_000, 2: 5 * 60_000, 3: 15 * 60_000 };
const backoffFor = (attempts) => BACKOFF_MS[attempts] ?? 15 * 60_000;

const DEAD_LETTER_CLASSES = new Set([
  "PERMANENT",
  "INVALID_DESTINATION",
  "UNVERIFIED_DESTINATION",
  "TEMPLATE_ERROR",
]);

const deliverByChannel = {
  push: deliverPush,
  email: async ({ user, templateKey, data }) => {
    if (!user.email) return { success: false, error: "no_email_on_file" };
    const ok = await emailService.sendEmail(user.email, templateKey, undefined, "en", {
      name: user.name,
      ...data,
    });
    return ok ? { success: true } : { success: false, error: "template_or_delivery_failed" };
  },
  sms: async ({ user, templateKey, data }) => {
    if (!user.mobile) return { success: false, error: "no_mobile_on_file" };
    const template = await smsTemplateService.getTemplate(templateKey);
    if (!template) return { success: false, error: "sms_template_not_configured" };
    const identifier = `${user.phone_code || "91"}${user.mobile}`;
    const merged = { name: user.name || "Customer", ...data };
    const result = await smsService.sendSMS({
      to: identifier,
      message: template.dlt_message_id,
      variables: template.variables.map((key) => merged[key] ?? ""),
      ...(template.sender_id ? { sender_id: template.sender_id } : {}),
    });
    return result?.success
      ? { success: true }
      : { success: false, error: typeof result?.error === "string" ? result.error : "delivery_failed" };
  },
  whatsapp: async ({ user, templateKey, data }) => {
    if (!user.mobile) return { success: false, error: "no_mobile_on_file" };
    const to = `${user.phone_code || "91"}${user.mobile}`;
    const merged = { name: user.name || "Customer", ...data };
    const result = await whatsappProvider.sendTemplate({ to, templateKey, data: merged });
    return result?.success
      ? { success: true, provider_message_id: result.provider_message_id }
      : { success: false, error: result?.error || "delivery_failed" };
  },
};

/** Claims and delivers a single due job. Returns the outcome, or null if there was nothing to claim. */
const processOne = async () => {
  const config = pushConfig();
  const leaseId = randomUUID();
  const job = await NotificationJob.findOneAndUpdate(
    { status: { $in: ["QUEUED", "RETRYING"] }, next_attempt_at: { $lte: new Date() },
      $or: [{ channel: { $ne: 'push' } }, ...(config.enabled ? [{ channel: 'push', environment: config.environment }] : [])] },
    { $set: { status: "SENDING", updated_at: new Date(), lease_id: leaseId, lease_until: new Date(Date.now() + 5 * 60000) }, $inc: { attempts: 1 } },
    { new: true, sort: { next_attempt_at: 1 } }
  );
  if (!job) return null;

  const user = await User.findOne({ _id: job.user_id, deleted_at: null }).lean();
  if (!user) {
    await NotificationJob.updateOne(
      { _id: job._id, lease_id: leaseId },
      { $set: { status: "DEAD_LETTER", error_class: "INVALID_DESTINATION", last_error_safe: "user_not_found", updated_at: new Date() } }
    );
    await syncLog(job, { status: "DEAD_LETTER", last_error_safe: "user_not_found" });
    return { jobId: job._id, status: "DEAD_LETTER" };
  }

  const deliver = deliverByChannel[job.channel];
  let outcome;
  try {
    outcome = deliver
      ? await deliver({ user, templateKey: job.template_id, data: job.data, job })
      : { success: false, error: "unsupported_channel" };
  } catch (err) {
    outcome = { success: false, error: err.message || "delivery_exception" };
  }

  if (outcome.success) {
    await NotificationJob.updateOne(
      { _id: job._id, lease_id: leaseId },
      { $set: { status: "SENT", error_class: null, last_error_safe: null, updated_at: new Date() } }
    );
    await syncLog(job, {
      status: "SENT",
      sent_at: new Date(),
      provider_message_id: outcome.provider_message_id || null,
    });
    return { jobId: job._id, status: "SENT" };
  }

  const errorClass = job.channel === 'push' ? (outcome.error === 'push_permanent' ? 'PERMANENT' : 'TRANSIENT') : classifyNotificationError(job.channel, outcome.error);
  const exhausted = job.attempts >= job.max_attempts;
  const nextStatus = DEAD_LETTER_CLASSES.has(errorClass) || exhausted ? "DEAD_LETTER" : "RETRYING";

  await NotificationJob.updateOne(
    { _id: job._id, lease_id: leaseId },
    {
      $set: {
        status: nextStatus,
        error_class: errorClass,
        last_error_safe: String(outcome.error || "").slice(0, 500),
        next_attempt_at: nextStatus === "RETRYING" ? new Date(Date.now() + Math.max(backoffFor(job.attempts), outcome.retryAfterMs || 0)) : job.next_attempt_at,
        updated_at: new Date(),
      },
    }
  );
  await syncLog(job, { status: nextStatus, last_error_safe: String(outcome.error || "").slice(0, 500) });

  return { jobId: job._id, status: nextStatus };
};

const syncLog = async (job, patch) => {
  if (!job.notification_log_id) return;
  await NotificationLog.updateOne(
    { _id: job.notification_log_id },
    { $set: { ...patch, attempt_count: job.attempts } }
  ).catch(() => {});
};

/**
 * processNotificationQueue — drains up to `batchSize` due jobs. Called from
 * a node-cron tick (src/server.js) every minute; also directly callable
 * from tests/an admin manual-retry endpoint for immediate processing.
 */
export const processNotificationQueue = async (batchSize = 25) => {
  try { await processCampaigns(); await repairPushOutbox(); }
  catch { console.error('push_outbox_tick_failed'); }
  const environment = pushConfig().environment;
  // Only push jobs have per-device idempotency records. Do not change legacy-channel recovery semantics.
  await NotificationJob.updateMany({ channel: 'push', environment, status: 'SENDING', lease_until: { $lt: new Date() } },
    { $set: { status: 'RETRYING', next_attempt_at: new Date(), lease_id: null } });
  await NotificationJob.updateMany({ channel: 'push', environment, status: 'RETRYING', $expr: { $gte: ['$attempts', '$max_attempts'] } },
    { $set: { status: 'DEAD_LETTER', error_class: 'PERMANENT', last_error_safe: 'push_attempts_exhausted' } });
  const results = [];
  for (let i = 0; i < batchSize; i++) {
    const result = await processOne();
    if (!result) break;
    results.push(result);
  }
  return results;
};
