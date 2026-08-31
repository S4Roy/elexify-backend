import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

// A queued unit of notification delivery work. sendNotification() (in
// services/notification/sendNotification.js) only ever ENQUEUES a job here
// — the actual provider call happens asynchronously in
// services/notification/processNotificationQueue.js, run on a cron tick, so
// a slow/broken email or SMS provider can never block or fail the request
// that triggered the notification (order placement, payment capture, etc).
const NotificationJobSchema = new Schema(
  {
    user_id: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },
    event: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      required: true,
      enum: ["email", "sms", "whatsapp"],
    },
    template_id: {
      type: String,
      required: true,
    },
    // Denormalized for the admin dead-letter listing (avoids a join back to
    // NotificationLog just to render a table row).
    destination_masked: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      default: null,
    },
    // Arbitrary event payload (order id, amount, etc.) — merged into the
    // template's Handlebars substitutions at send time.
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Idempotency key: `${businessEntityId}:${event}` for domain events tied
    // to an order/payment/etc — a second sendNotification() call with the
    // same (user_id, event, channel, dedupe_key) is a no-op (unique index
    // below). null for one-off events with no natural key (password/contact
    // changes) — those are never deduped against each other.
    dedupe_key: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["QUEUED", "SENDING", "SENT", "FAILED", "RETRYING", "DEAD_LETTER"],
      default: "QUEUED",
    },
    attempts: {
      type: Number,
      default: 0,
    },
    max_attempts: {
      type: Number,
      default: 3,
    },
    next_attempt_at: {
      type: Date,
      default: Date.now,
    },
    error_class: {
      type: String,
      enum: [
        "TRANSIENT",
        "PERMANENT",
        "INVALID_DESTINATION",
        "UNVERIFIED_DESTINATION",
        "TEMPLATE_ERROR",
        "PROVIDER_REJECTED",
        null,
      ],
      default: null,
    },
    last_error_safe: {
      type: String,
      default: null,
    },
    // Linked NotificationLog row id, kept in sync as the job transitions.
    notification_log_id: {
      type: Types.ObjectId,
      ref: "notification_logs",
      default: null,
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

// Idempotency guard — see `dedupe_key` doc above. Only enforced when
// dedupe_key is an actual string (matches User.js's partial-index
// convention for "optional uniqueness").
NotificationJobSchema.index(
  { user_id: 1, event: 1, channel: 1, dedupe_key: 1 },
  { unique: true, partialFilterExpression: { dedupe_key: { $type: "string" } } }
);

// Worker poll query: due jobs by status.
NotificationJobSchema.index({ status: 1, next_attempt_at: 1 });

NotificationJobSchema.plugin(mongooseAggregatePaginate);

const NotificationJob = model("notification_jobs", NotificationJobSchema);

export default NotificationJob;
