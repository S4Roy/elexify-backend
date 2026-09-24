import mongoose from "mongoose";

const schema = new mongoose.Schema({
  organization_id: { type: String, required: true },
  kind: { type: String, enum: ["item", "variation", "contact", "order_contact", "salesorder"], required: true },
  entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ["queued", "running", "retrying", "synced", "dead_letter", "review"], default: "queued" },
  revision: { type: Number, default: 1 },
  source_version: { type: Number, default: 0 },
  attempts: { type: Number, default: 0 },
  next_attempt_at: { type: Date, default: Date.now },
  lease_owner: String,
  lease_until: Date,
  last_error: String,
  last_error_detail: { type: Object, default: null },
  synced_at: Date,
}, { timestamps: true });
schema.index({ organization_id: 1, kind: 1, entity_id: 1 }, { unique: true });
schema.index({ organization_id: 1, status: 1, next_attempt_at: 1 });
schema.index({ organization_id: 1, status: 1, lease_until: 1 });
export default mongoose.model("zoho_sync_jobs", schema);
