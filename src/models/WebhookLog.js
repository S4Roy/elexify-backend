import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model, Types } = mongoose;

// Append-only audit trail of every inbound provider webhook call — distinct
// from WebhookEvent (src/models/WebhookEvent.js), which is an idempotent
// processing inbox with retry/dead-letter state for side-effecting events
// (currently Razorpay refunds). This log records every call as received,
// including exact-duplicate redeliveries, purely for admin review/
// debugging — it never gates or dedupes processing.
const WebhookLogSchema = new Schema(
  {
    provider: { type: String, required: true, index: true },
    event_type: { type: String, required: true },

    // Loose correlation fields — whichever the provider's payload actually
    // carried, so an admin can search "everything for this order/AWB"
    // without needing a live Package/Order match at write time.
    order_id: { type: String, default: null, index: true },
    package_id: { type: Types.ObjectId, ref: "packages", default: null },
    shiprocket_order_id: { type: String, default: null, index: true },
    awb: { type: String, default: null, index: true },

    incoming_status: { type: String, default: null },
    mapped_status: { type: String, default: null },

    outcome: {
      type: String,
      enum: ["processed", "ignored", "error"],
      required: true,
      index: true,
    },
    outcome_detail: { type: String, default: null },
    status_code: { type: Number, default: 200 },

    // Raw request body as received — same convention as Package.timeline's
    // `raw` field (src/models/Package.js) and OrderScans.raw.
    payload: { type: Object, default: {} },

    processing_ms: { type: Number, default: null },
    received_at: { type: Date, default: Date.now, index: true },
    created_at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false },
);

WebhookLogSchema.index({ provider: 1, received_at: -1 });

WebhookLogSchema.plugin(mongooseAggregatePaginate);

const WebhookLog = model("webhook_logs", WebhookLogSchema);
export default WebhookLog;
