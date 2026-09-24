import mongoose from "mongoose";

const schema = new mongoose.Schema({
  job_id: mongoose.Schema.Types.ObjectId,
  actor_id: mongoose.Schema.Types.ObjectId,
  organization_id: String,
  event: { type: String, required: true },
  kind: String,
  entity_id: mongoose.Schema.Types.ObjectId,
  attempt: Number,
  code: String,
  message: String,
  detail: Object,
  created_at: { type: Date, default: Date.now },
});
schema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 86400 });
schema.index({ organization_id: 1, created_at: -1 });
export default mongoose.model("zoho_integration_logs", schema);
