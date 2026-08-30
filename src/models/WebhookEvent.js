import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Dedup + audit trail for externally-delivered webhook events (currently
// Razorpay refund events). A unique index on event_id means a duplicate
// delivery fails to insert rather than being processed twice.
const WebhookEventSchema = new Schema(
  {
    event_id: { type: String, required: true, unique: true },
    event_type: { type: String, required: true },
    payload: { type: Object, default: {} },
    payload_hash: { type: String, required: true },
    status: {
      type: String,
      enum: ["received", "processing", "completed", "failed", "dead_letter"],
      default: "received",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    last_error: { type: String, default: null },
    next_retry_at: { type: Date, default: null, index: true },
    received_at: { type: Date, default: Date.now },
    processed_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

const WebhookEvent = model("webhook_events", WebhookEventSchema);
export default WebhookEvent;
