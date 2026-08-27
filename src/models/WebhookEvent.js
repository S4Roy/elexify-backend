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
    processed_at: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

const WebhookEvent = model("webhook_events", WebhookEventSchema);
export default WebhookEvent;
