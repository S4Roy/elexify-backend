// Canonical notification event names + metadata. Callers of
// services/notification/index.js#sendNotification must pass one of these
// keys as `event` rather than a free-text string, so eligible
// channels/templates/mandatory-ness stay in one place instead of scattered
// across controllers.

export const NOTIFICATION_EVENTS = {
  ORDER_PLACED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: true,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_placed",
  },
  PAYMENT_SUCCESS: {
    category: "transactional",
    preferenceKey: "payment",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "payment_success",
  },
  PAYMENT_FAILED: {
    category: "transactional",
    preferenceKey: "payment",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "payment_failed",
  },
  ORDER_PROCESSING: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_processing",
  },
  ORDER_SHIPPED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_shipped",
  },
  ORDER_OUT_FOR_DELIVERY: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_out_for_delivery",
  },
  ORDER_DELIVERED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_delivered",
  },
  ORDER_CANCELLED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "order_cancelled",
  },
  REFUND_INITIATED: {
    category: "transactional",
    preferenceKey: "refund",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "refund_initiated",
  },
  REFUND_COMPLETED: {
    category: "transactional",
    preferenceKey: "refund",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "refund_completed",
  },

  ACCOUNT_LOGIN: {
    category: "security",
    preferenceKey: "security",
    mandatory: false,
    channels: ["email", "sms"],
    templateKey: "account_login",
  },
  PASSWORD_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "password_changed",
  },
  EMAIL_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email"],
    templateKey: "email_changed",
  },
  MOBILE_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "mobile_changed",
  },
  SUSPICIOUS_ACTIVITY: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "suspicious_activity",
  },

  PROMOTIONAL_OFFER: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "promotional_offer",
  },
  BACK_IN_STOCK: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "back_in_stock",
  },
  PRICE_DROP: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "price_drop",
  },

  ABANDONED_CART: {
    category: "reminder",
    preferenceKey: "reminders",
    mandatory: false,
    channels: ["email", "whatsapp"],
    templateKey: "abandoned_cart",
  },
};

export const getNotificationEvent = (event) => NOTIFICATION_EVENTS[event] || null;
