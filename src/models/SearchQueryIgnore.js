import mongoose from "mongoose";
// Queries an admin has reviewed and chosen to hide from Search Insights (junk, part numbers we don't stock).
// Hiding never changes the recorded searches or the summary totals.
const schema = new mongoose.Schema({
  query: { type: String, required: true, maxlength: 200 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ query: 1 }, { unique: true });
export default mongoose.model("search_query_ignores", schema);
