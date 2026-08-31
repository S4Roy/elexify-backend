// Maps (event.preferenceKey, channel) -> the boolean field path inside a
// NotificationPreference document that controls it. Kept separate from the
// event registry since several events can share one preference toggle
// (e.g. ORDER_PLACED/ORDER_SHIPPED/ORDER_DELIVERED all read
// transactional.order_*).

const PATHS = {
  order: { email: "transactional.order_email", sms: "transactional.order_sms", whatsapp: "transactional.order_whatsapp" },
  payment: { email: "transactional.payment_email", sms: "transactional.payment_sms" },
  refund: { email: "transactional.refund_email", sms: "transactional.refund_sms" },
  security: { email: "security.email", sms: "security.sms" },
  marketing: { email: "marketing.email", sms: "marketing.sms", whatsapp: "marketing.whatsapp" },
  reminders: { email: "reminders.abandoned_cart_email", whatsapp: "reminders.abandoned_cart_whatsapp" },
};

const getByPath = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

// Returns null (no opinion — treat as "not eligible") when there's no
// mapping, so a caller never accidentally sends on an unmapped combination.
export const getPreferenceValue = (preferences, preferenceKey, channel) => {
  const path = PATHS[preferenceKey]?.[channel];
  if (!path) return null;
  const value = getByPath(preferences, path);
  return typeof value === "boolean" ? value : null;
};
