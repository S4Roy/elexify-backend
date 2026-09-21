import mongoose from "mongoose";

// Shared across API instances; no raw IP addresses or customer identifiers.
const schema = new mongoose.Schema({
  _id: String,
  attempts: { type: Number, default: 0 },
  expires_at: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("abuse_windows", schema);
