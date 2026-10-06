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

// Atomic get-or-create. Several requests right after login (account screen,
// login/cart notifications) can reach this together; a find-then-create
// raced into E11000 on the unique user_id index.
export const ensurePreferences = async (userId, { lean = false } = {}) => {
  const query = NotificationPreference.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: { user_id: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  try {
    return await (lean ? query.lean() : query);
  } catch (error) {
    // Two concurrent upserts can still collide; the other one created it.
    if (error?.code !== 11000) throw error;
    const existing = NotificationPreference.findOne({ user_id: userId });
    return lean ? existing.lean() : existing;
  }
};

export const getPreferencesDoc = (userId) => ensurePreferences(userId);
