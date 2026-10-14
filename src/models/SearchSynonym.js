import mongoose from "mongoose";
// A whole normalized query (term) that also searches for each alternative.
const schema = new mongoose.Schema({
  term: { type: String, required: true, maxlength: 100 },
  alternatives: { type: [{ type: String, maxlength: 100 }], required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ term: 1 }, { unique: true });
export default mongoose.model("search_synonyms", schema);
