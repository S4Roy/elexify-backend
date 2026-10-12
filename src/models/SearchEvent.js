import mongoose from "mongoose";
const schema = new mongoose.Schema({
  query: { type: String, required: true, maxlength: 200 },
  result_count: { type: Number, required: true, min: 0 },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ created_at: 1 }, { expireAfterSeconds: 90 * 86400 });
schema.index({ query: 1, created_at: -1 });
export default mongoose.model("search_events", schema);
