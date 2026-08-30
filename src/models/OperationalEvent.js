import mongoose from "mongoose";
const { Schema, model } = mongoose;

const OperationalEventSchema = new Schema({
  event_type: {
    type: String,
    enum: [
      "illegal_order_transition", "illegal_payment_transition", "carrier_transition_rejected",
      "razorpay_webhook_failed", "webhook_dead_letter", "provider_attempt_orphaned",
      "provider_reconciliation_failed", "refund_failed", "transaction_aborted",
    ],
    required: true,
    index: true,
  },
  severity: { type: String, enum: ["warning", "error", "critical"], default: "error", index: true },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
  correlation_id: { type: String, default: null, index: true },
  summary: { type: String, required: true, maxlength: 500 },
  metadata: { type: Object, default: {} },
  occurrences: { type: Number, default: 0 },
  first_seen_at: { type: Date, default: Date.now },
  last_seen_at: { type: Date, default: Date.now, index: true },
  alert_last_sent_at: { type: Date, default: null },
  alert_next_eligible_at: { type: Date, default: null, index: true },
  alert_delivery_count: { type: Number, default: 0 },
  alert_last_status: { type: String, enum: ["sent", "failed"], default: null },
  alert_last_error: { type: String, default: null, maxlength: 500 },
  resolved_at: { type: Date, default: null },
}, { versionKey: false });

OperationalEventSchema.index({ event_type: 1, correlation_id: 1, status: 1 });

export default model("operational_events", OperationalEventSchema);
