import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// One document per user. Transactional/security toggles are stored so the
// UI can render them (checked + disabled), but services/notification/index.js
// never honors a `false` value for an event flagged `mandatory` in
// constants/notificationEvents.js — the schema default here is informational,
// not enforcement.
const NotificationPreferenceSchema = new Schema(
  {
    user_id: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },

    transactional: {
      order_email: { type: Boolean, default: true },
      order_sms: { type: Boolean, default: true },
      order_whatsapp: { type: Boolean, default: false },

      payment_email: { type: Boolean, default: true },
      payment_sms: { type: Boolean, default: true },

      refund_email: { type: Boolean, default: true },
      refund_sms: { type: Boolean, default: true },
    },

    security: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
    },

    marketing: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },

    reminders: {
      abandoned_cart_email: { type: Boolean, default: false },
      abandoned_cart_whatsapp: { type: Boolean, default: false },
      wishlist_email: { type: Boolean, default: false },
    },

    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: null,
    },
  },
  { versionKey: false }
);

NotificationPreferenceSchema.index({ user_id: 1 }, { unique: true });

const NotificationPreference = model(
  "notification_preferences",
  NotificationPreferenceSchema
);

export default NotificationPreference;
