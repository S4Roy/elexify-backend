import User from "../../models/User.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import NotificationLog from "../../models/NotificationLog.js";
import NotificationJob from "../../models/NotificationJob.js";
import { getNotificationEvent } from "../../constants/notificationEvents.js";
import { getPreferenceValue } from "./preferencePath.js";
import { generalHelper } from "../../helpers/index.js";

const getOrCreatePreferences = async (userId) => {
  const existing = await NotificationPreference.findOne({ user_id: userId }).lean();
  if (existing) return existing;
  const created = await NotificationPreference.create({ user_id: userId });
  return created.toObject();
};

const maskDestination = (channel, user) =>
  channel === "email"
    ? generalHelper.maskEmail(user.email)
    : generalHelper.maskMobile(user.mobile, user.phone_code);

/**
 * enqueue — creates one NotificationJob + one NotificationLog(QUEUED) row
 * for a single eligible channel. Idempotent on (user_id, event, channel,
 * dedupe_key) via NotificationJob's partial unique index — a duplicate
 * enqueue for the same dedupeKey is a silent no-op, not an error.
 */
const providerFor = (channel) =>
  channel === "email" ? "smtp" : channel === "sms" ? "fast2sms" : "whatsapp_cloud_api";

const enqueue = async ({ userId, event, channel, templateId, data, dedupeKey }) => {
  try {
    const user = await User.findById(userId).lean();
    const destination_masked = user ? maskDestination(channel, user) : null;
    const provider = providerFor(channel);

    const job = await NotificationJob.create({
      user_id: userId,
      event,
      channel,
      template_id: templateId,
      destination_masked,
      provider,
      data,
      dedupe_key: dedupeKey ?? null,
    });

    const log = await NotificationLog.create({
      user_id: userId,
      job_id: job._id,
      event,
      channel,
      destination_masked,
      template_id: templateId,
      provider,
      status: "QUEUED",
    });

    await NotificationJob.updateOne({ _id: job._id }, { $set: { notification_log_id: log._id } });

    return { channel, queued: true };
  } catch (error) {
    // 11000 = duplicate key on the (user_id, event, channel, dedupe_key)
    // index — this exact notification is already queued/handled. Any other
    // error is logged but still swallowed (see sendNotification's own
    // try/catch) — enqueue failures must never break the caller.
    if (error?.code !== 11000) {
      console.error("notification enqueue error:", error.message);
    }
    return { channel, queued: false, duplicate: error?.code === 11000 };
  }
};

/**
 * sendNotification({ userId, event, data, dedupeKey })
 *
 * Resolves eligible channels (preference AND verified-contact AND, for a
 * `mandatory` event, always-on regardless of preference) and enqueues one
 * NotificationJob per eligible channel for services/notification/
 * processNotificationQueue.js (run on a cron tick) to actually deliver.
 * Never throws, and never does any network I/O itself — callers can treat
 * this as a fire-and-forget, near-instant call safe to leave un-awaited
 * after a business transaction has already committed.
 */
export const sendNotification = async ({ userId, event, data = {}, dedupeKey = null }) => {
  try {
    const eventMeta = getNotificationEvent(event);
    if (!eventMeta) {
      console.error(`Unknown notification event: ${event}`);
      return { success: false, error: "unknown_event" };
    }

    const user = await User.findOne({ _id: userId, deleted_at: null }).lean();
    if (!user) return { success: false, error: "user_not_found" };

    const preferences = await getOrCreatePreferences(userId);

    const results = [];

    for (const channel of eventMeta.channels) {
      // email is gated on email_verified_at; sms and whatsapp are both
      // mobile-based channels, gated on mobile_verified_at.
      const isVerified = channel === "email" ? !!user.email_verified_at : !!user.mobile_verified_at;
      if (!isVerified) continue;

      if (!eventMeta.mandatory) {
        const preferred = getPreferenceValue(preferences, eventMeta.preferenceKey, channel);
        if (preferred === false) continue;
      }

      const outcome = await enqueue({
        userId,
        event,
        channel,
        templateId: eventMeta.templateKey,
        data,
        dedupeKey,
      });
      results.push(outcome);
    }

    return { success: true, results };
  } catch (error) {
    // Notification failures must never bubble up into the caller's
    // transaction (order/payment flows in particular).
    console.error("sendNotification error:", error.message);
    return { success: false, error: "internal_error" };
  }
};
