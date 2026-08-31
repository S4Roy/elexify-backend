import User from "../../models/User.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import NotificationLog from "../../models/NotificationLog.js";
import { getNotificationEvent } from "../../constants/notificationEvents.js";
import { getPreferenceValue } from "./preferencePath.js";
import { emailService, smsService } from "../index.js";
import * as whatsappProvider from "./whatsapp.provider.js";
import { generalHelper } from "../../helpers/index.js";

const getOrCreatePreferences = async (userId) => {
  const existing = await NotificationPreference.findOne({ user_id: userId }).lean();
  if (existing) return existing;
  const created = await NotificationPreference.create({ user_id: userId });
  return created.toObject();
};

const logAttempt = async ({ userId, event, channel, destination, templateKey, status, error }) => {
  const destination_masked =
    channel === "email"
      ? generalHelper.maskEmail(destination)
      : generalHelper.maskMobile(destination);

  await NotificationLog.create({
    user_id: userId,
    event,
    channel,
    destination_masked,
    template_id: templateKey,
    provider: channel === "email" ? "smtp" : channel === "sms" ? "fast2sms" : "whatsapp",
    status,
    attempt_count: 1,
    last_error_safe: error || null,
    sent_at: status === "SENT" ? new Date() : null,
  });
};

const deliverByChannel = {
  email: async ({ user, templateKey, data }) => {
    if (!user.email) return { success: false, error: "no_email_on_file" };
    const ok = await emailService.sendEmail(
      user.email,
      templateKey,
      undefined,
      "en",
      { name: user.name, ...data }
    );
    return ok ? { success: true } : { success: false, error: "template_or_delivery_failed" };
  },
  sms: async ({ user, templateKey, data }) => {
    if (!user.mobile) return { success: false, error: "no_mobile_on_file" };
    const identifier = `${user.phone_code || "91"}${user.mobile}`;
    const result = await smsService.sendSMS({
      to: identifier,
      message: templateKey,
      variables: [user.name || "Customer", ...(data?.smsVariables || [])],
    });
    return result?.success ? { success: true } : { success: false, error: "delivery_failed" };
  },
  whatsapp: async ({ templateKey, data }) => {
    const result = await whatsappProvider.sendTemplate({ templateKey, data });
    return result?.success ? { success: true } : { success: false, error: result?.error || "delivery_failed" };
  },
};

/**
 * sendNotification({ userId, event, data })
 *
 * Centralized notification dispatch: loads the user + their preferences,
 * resolves eligible channels (preference AND verified-contact AND, for a
 * `mandatory` event, always-on regardless of preference), delivers via the
 * existing per-channel provider, and logs one NotificationLog row per
 * channel attempted. Never throws — a provider outage must not break the
 * caller's business transaction (e.g. order placement).
 */
export const sendNotification = async ({ userId, event, data = {} }) => {
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
      const isVerified = channel === "email" ? !!user.email_verified_at : channel === "sms" ? !!user.mobile_verified_at : false;

      // WhatsApp has no live provider yet — never counts as eligible.
      if (channel === "whatsapp" && !eventMeta.mandatory) {
        const preferred = getPreferenceValue(preferences, eventMeta.preferenceKey, channel);
        if (!preferred) continue;
      }

      if (!isVerified && channel !== "whatsapp") continue;

      if (!eventMeta.mandatory) {
        const preferred = getPreferenceValue(preferences, eventMeta.preferenceKey, channel);
        if (preferred === false) continue;
      }

      const deliver = deliverByChannel[channel];
      if (!deliver) continue;

      let outcome;
      try {
        outcome = await deliver({ user, templateKey: eventMeta.templateKey, data });
      } catch (err) {
        outcome = { success: false, error: "delivery_exception" };
      }

      const destination = channel === "email" ? user.email : user.mobile;
      await logAttempt({
        userId,
        event,
        channel,
        destination,
        templateKey: eventMeta.templateKey,
        status: outcome.success ? "SENT" : "FAILED",
        error: outcome.success ? null : outcome.error,
      });

      results.push({ channel, ...outcome });
    }

    return { success: true, results };
  } catch (error) {
    // Notification failures must never bubble up into the caller's
    // transaction (order/payment flows in particular).
    console.error("sendNotification error:", error.message);
    return { success: false, error: "internal_error" };
  }
};
