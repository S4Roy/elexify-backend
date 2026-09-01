import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// Append-only audit trail for sensitive profile changes. Never store OTP
// values or other secrets here.
const AuditLogSchema = new Schema(
  {
    user_id: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },
    event: {
      type: String,
      required: true,
      enum: [
        "EMAIL_CHANGE_REQUESTED",
        "EMAIL_CHANGED",
        "MOBILE_CHANGE_REQUESTED",
        "MOBILE_CHANGED",
        "NOTIFICATION_PREFERENCES_CHANGED",
        "PASSWORD_CHANGED",
        "CONTACT_VERIFICATION_OVERRIDE",
        "NOTIFICATION_MANUAL_RETRY",
        "NOTIFICATION_PREFERENCE_ADMIN_CHANGE",
        "EMAIL_TEMPLATE_UPDATED",
        "EMAIL_TEMPLATE_RESET",
        "EMAIL_TEMPLATE_TEST_SENT",
      ],
    },
    // Set for admin-initiated events (verification override, manual retry,
    // admin preference change) — the admin user who performed the action.
    // user_id above always identifies the customer the action concerns.
    actor_id: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    // Required by the admin UI for verification overrides; optional
    // elsewhere. Never contains OTP or other secrets.
    reason: {
      type: String,
      default: null,
    },
    // Safe, structured context (e.g. { channel, previous_state, new_state }
    // for a verification override). Never OTP/tokens/provider secrets.
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    user_agent: {
      type: String,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

AuditLogSchema.index({ user_id: 1, created_at: -1 });

const AuditLog = model("audit_logs", AuditLogSchema);

export default AuditLog;
