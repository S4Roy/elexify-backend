import NotificationPreference from "../../models/NotificationPreference.js";

// Shared by controllers/user/account/notificationPreferences.js (customer
// self-service) and controllers/admin/customerAccount/notificationPreferences.js
// (admin read/override) — kept in one place so the two surfaces can never
// silently drift on which toggles are mandatory.
export const MANDATORY_LOCKED_PATHS = [
  ["security", "email"],
  ["security", "sms"],
  ["transactional", "order_email"],
  ["transactional", "payment_email"],
  ["transactional", "payment_sms"],
  ["transactional", "refund_email"],
  ["transactional", "refund_sms"],
];

export const getPreferencesDoc = async (userId) => {
  let doc = await NotificationPreference.findOne({ user_id: userId });
  if (!doc) doc = await NotificationPreference.create({ user_id: userId });
  return doc;
};
