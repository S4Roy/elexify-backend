import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

const NotificationLogSchema = new Schema(
  {
    user_id: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },
    job_id: {
      type: Types.ObjectId,
      ref: "notification_jobs",
      default: null,
    },
    event: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      required: true,
      enum: ["email", "sms", "whatsapp", "push"],
    },
    // masked, e.g. "s***@gmail.com" / "+91 ******7816" — never the raw
    // destination, and never the message body/OTP.
    destination_masked: {
      type: String,
      default: null,
    },
    template_id: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      default: null,
    },
    provider_message_id: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "BOUNCED", "RETRYING", "DEAD_LETTER"],
      default: "QUEUED",
    },
    attempt_count: {
      type: Number,
      default: 1,
    },
    last_error_safe: {
      type: String,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    sent_at: {
      type: Date,
      default: null,
    },
    delivered_at: {
      type: Date,
      default: null,
    },
  },
  { versionKey: false }
);

NotificationLogSchema.index({ user_id: 1, created_at: -1 });
NotificationLogSchema.index({ event: 1 });

NotificationLogSchema.plugin(mongooseAggregatePaginate);

const NotificationLog = model("notification_logs", NotificationLogSchema);

export default NotificationLog;
