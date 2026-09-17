// Canonical notification event names + metadata. Callers of
// services/notification/index.js#sendNotification must pass one of these
// keys as `event` rather than a free-text string, so eligible
// channels/templates/mandatory-ness stay in one place instead of scattered
// across controllers.
//
// `messagingVariables` is the ordered variable list WhatsApp (Meta template
// `{{1}} {{2}} ...` positional params — see whatsapp.provider.js) fills in.
// SMS no longer reads this: its variable order/message_id/copy now live
// per-event in models/SmsTemplate.js (admin-editable, seeded by
// constants/smsTemplateDefaults.js), decoupled from this WhatsApp-only
// contract. Both channels still require the *content* behind these
// positions to be pre-registered with the provider (DLT for SMS, Meta
// Business Manager for WhatsApp) before it can actually send.

export const NOTIFICATION_EVENTS = {
  ORDER_PLACED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: true,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_placed",
    messagingVariables: ["name", "order_id", "grand_total"],
  },
  PAYMENT_SUCCESS: {
    category: "transactional",
    preferenceKey: "payment",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "payment_success",
    messagingVariables: ["name", "order_id", "grand_total"],
  },
  PAYMENT_FAILED: {
    category: "transactional",
    preferenceKey: "payment",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "payment_failed",
    messagingVariables: ["name", "order_id"],
  },
  ORDER_PROCESSING: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_processing",
    messagingVariables: ["name", "order_id"],
  },
  ORDER_PACKED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    // Only SMS has an approved template for this event right now — add
    // "email"/"whatsapp" once copy is approved for those channels too.
    channels: ["sms"],
    templateKey: "order_packed",
    messagingVariables: ["name", "order_id"],
  },
  ORDER_SHIPPED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_shipped",
    messagingVariables: ["name", "order_id", "tracking_number"],
  },
  ORDER_OUT_FOR_DELIVERY: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_out_for_delivery",
    messagingVariables: ["name", "order_id"],
  },
  ORDER_DELIVERED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "order_delivered",
    messagingVariables: ["name", "order_id"],
  },
  ORDER_CANCELLED: {
    category: "transactional",
    preferenceKey: "order",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "order_cancelled",
    messagingVariables: ["name", "order_id"],
  },
  REFUND_INITIATED: {
    category: "transactional",
    preferenceKey: "refund",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "refund_initiated",
    messagingVariables: ["name", "order_id", "grand_total"],
  },
  REFUND_COMPLETED: {
    category: "transactional",
    preferenceKey: "refund",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "refund_completed",
    messagingVariables: ["name", "order_id", "grand_total"],
  },
  RETURN_REQUESTED: {
    category: "transactional", preferenceKey: "order", mandatory: true,
    channels: ["email", "sms", "whatsapp"], templateKey: "return_requested",
    messagingVariables: ["name", "return_request_number"],
  },
  RETURN_APPROVED: {
    category: "transactional", preferenceKey: "order", mandatory: true,
    channels: ["email", "sms", "whatsapp"], templateKey: "return_approved",
    messagingVariables: ["name", "return_request_number"],
  },
  RETURN_REJECTED: {
    category: "transactional", preferenceKey: "order", mandatory: true,
    channels: ["email", "sms", "whatsapp"], templateKey: "return_rejected",
    messagingVariables: ["name", "return_request_number"],
  },
  RETURN_RECEIVED: {
    category: "transactional", preferenceKey: "order", mandatory: true,
    channels: ["email", "sms", "whatsapp"], templateKey: "return_received",
    messagingVariables: ["name", "return_request_number"],
  },
  RETURN_COMPLETED: {
    category: "transactional", preferenceKey: "refund", mandatory: true,
    channels: ["email", "sms", "whatsapp"], templateKey: "return_completed",
    messagingVariables: ["name", "return_request_number"],
  },

  RETURN_UPDATED: {
    category: 'transactional', preferenceKey: 'order', mandatory: true,
    channels: ['email', 'sms', 'whatsapp'], templateKey: 'return_updated',
    messagingVariables: ["name", "return_request_number", "return_status"],
  },

  ACCOUNT_LOGIN: {
    category: "security",
    preferenceKey: "security",
    mandatory: false,
    channels: ["email", "sms"],
    templateKey: "account_login",
    messagingVariables: ["name"],
  },
  PASSWORD_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "password_changed",
    messagingVariables: ["name"],
  },
  EMAIL_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email"],
    templateKey: "email_changed",
    messagingVariables: ["name"],
  },
  MOBILE_CHANGED: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "mobile_changed",
    messagingVariables: ["name"],
  },
  SUSPICIOUS_ACTIVITY: {
    category: "security",
    preferenceKey: "security",
    mandatory: true,
    channels: ["email", "sms"],
    templateKey: "suspicious_activity",
    messagingVariables: ["name"],
  },

  PROMOTIONAL_OFFER: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "promotional_offer",
    messagingVariables: ["name"],
  },
  BACK_IN_STOCK: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "back_in_stock",
    messagingVariables: ["name"],
  },
  PRICE_DROP: {
    category: "marketing",
    preferenceKey: "marketing",
    mandatory: false,
    channels: ["email", "sms", "whatsapp"],
    templateKey: "price_drop",
    messagingVariables: ["name"],
  },

  ABANDONED_CART: {
    category: "reminder",
    preferenceKey: "reminders",
    mandatory: false,
    channels: ["email", "whatsapp"],
    templateKey: "abandoned_cart",
    messagingVariables: ["name"],
  },
};

export const getNotificationEvent = (event) => NOTIFICATION_EVENTS[event] || null;
