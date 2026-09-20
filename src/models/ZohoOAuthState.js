import mongoose from "mongoose";

const schema = new mongoose.Schema({
  digest: { type: String, unique: true, required: true },
  actor_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  region: { type: String, required: true },
  expires_at: { type: Date, required: true },
});
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("zoho_oauth_states", schema);
