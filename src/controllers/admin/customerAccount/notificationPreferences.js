import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";
import { MANDATORY_LOCKED_PATHS, getPreferencesDoc } from "../../../services/notification/preferencesDoc.js";

export const getNotificationPreferences = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({
      _id: id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    }).lean();
    if (!user) throw StatusError.notFound(req.__("Customer not found"));

    const preferences = await getPreferencesDoc(id);

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

// Admin override — same mandatory-lock enforcement as the customer-facing
// endpoint (controllers/user/account/notificationPreferences.js), never
// silently overrides a customer's marketing opt-out either: this is a
// PATCH like the self-service one, not a "reset to defaults" action.
export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin_id = req.auth?.user_id;

    const user = await User.findOne({
      _id: id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    }).lean();
    if (!user) throw StatusError.notFound(req.__("Customer not found"));

    const { transactional, security, marketing, reminders } = req.body;
    const preferences = await getPreferencesDoc(id);

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

    const before = preferences.toObject();
    if (transactional) Object.assign(preferences.transactional, transactional);
    if (security) Object.assign(preferences.security, security);
    if (marketing) Object.assign(preferences.marketing, marketing);
    if (reminders) Object.assign(preferences.reminders, reminders);
    preferences.updated_at = new Date();
    await preferences.save();

    await auditService.recordAudit({
      userId: id,
      event: "NOTIFICATION_PREFERENCE_ADMIN_CHANGE",
      req,
      actorId: admin_id,
      metadata: { before, after: preferences.toObject() },
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
