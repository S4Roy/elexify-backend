import User from "../../../models/User.js";
import NotificationPreference from "../../../models/NotificationPreference.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

const MANDATORY_LOCKED_PATHS = [
  ["security", "email"],
  ["security", "sms"],
  ["transactional", "order_email"],
  ["transactional", "payment_email"],
  ["transactional", "payment_sms"],
  ["transactional", "refund_email"],
  ["transactional", "refund_sms"],
];

const getPreferencesDoc = async (userId) => {
  let doc = await NotificationPreference.findOne({ user_id: userId });
  if (!doc) doc = await NotificationPreference.create({ user_id: userId });
  return doc;
};

export const getNotificationPreferences = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const user = await User.findOne({ _id: user_id, deleted_at: null }).lean();
    if (!user) throw StatusError.notFound("Profile not found");

    const preferences = await getPreferencesDoc(user_id);

    res.status(200).json({
      status: "success",
      message: req.__("Notification preferences fetched successfully"),
      data: {
        preferences: preferences.toObject(),
        email_verified: !!user.email_verified_at,
        mobile_verified: !!user.mobile_verified_at,
        mandatory_locked_paths: MANDATORY_LOCKED_PATHS.map((p) => p.join(".")),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const { transactional, security, marketing, reminders } = req.body;

    const preferences = await getPreferencesDoc(user_id);

    // Mandatory transactional/security toggles can't be turned off — reject
    // rather than silently ignoring, so the UI/API contract is explicit.
    for (const [group, key] of MANDATORY_LOCKED_PATHS) {
      const incomingGroup = { transactional, security }[group];
      if (incomingGroup && incomingGroup[key] === false) {
        throw StatusError.badRequest(
          req.__("{{group}}.{{key}} is a required notification and cannot be disabled", {
            group,
            key,
          })
        );
      }
    }

    if (transactional) Object.assign(preferences.transactional, transactional);
    if (security) Object.assign(preferences.security, security);
    if (marketing) Object.assign(preferences.marketing, marketing);
    if (reminders) Object.assign(preferences.reminders, reminders);
    preferences.updated_at = new Date();

    await preferences.save();

    await auditService.recordAudit({
      userId: user_id,
      event: "NOTIFICATION_PREFERENCES_CHANGED",
      req,
    });

    res.status(200).json({
      status: "success",
      message: req.__("Notification preferences updated successfully"),
      data: { preferences: preferences.toObject() },
    });
  } catch (error) {
    next(error);
  }
};
