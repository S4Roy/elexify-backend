import mongoose from "mongoose";
const schema = new mongoose.Schema({
  query: { type: String, required: true, maxlength: 200 },
  result_count: { type: Number, default: null, min: 0 },
  event_id: { type: String, maxlength: 36 },
  event_type: { type: String, enum: ["legacy", "search", "suggestion"], default: "legacy" },
  platform: { type: String, enum: ["web", "mobile"] },
  source: { type: String, enum: ["submitted", "results_url", "suggestion"] },
  submitted: { type: Boolean, default: false },
  results_viewed: { type: Boolean, default: false },
  filters: { type: Object, default: {} },
  filtered: { type: Boolean, default: false },
  product_id: { type: String, maxlength: 100 },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 86400 });
schema.index({ event_id: 1 }, { unique: true, sparse: true });
schema.index({ event_type: 1, created_at: -1 });
schema.index({ query: 1, created_at: -1 });
export default mongoose.model("search_events", schema);
