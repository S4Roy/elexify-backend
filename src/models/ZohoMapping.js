import mongoose from "mongoose";

const schema = new mongoose.Schema({
  organization_id: { type: String, required: true },
  kind: { type: String, required: true },
  identity: { type: String, required: true },
  remote_id: String,
  remote_number: String,
  state: { type: String, enum: ["new", "creating", "mapped"], default: "new" },
  synced_at: Date,
  entity_id: mongoose.Schema.Types.ObjectId,
  entity_kind: String,
  source_hash: String,
  pending_hash: String,
  checked_at: Date,
}, { timestamps: true });
schema.index({ organization_id: 1, kind: 1, identity: 1 }, { unique: true });
schema.index({ organization_id: 1, kind: 1, remote_id: 1 });
schema.index({ organization_id: 1, state: 1, checked_at: 1 });
export default mongoose.model("zoho_mappings", schema);
