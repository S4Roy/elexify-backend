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
      ],
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
