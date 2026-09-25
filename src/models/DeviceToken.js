import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "users", required: true },
    environment: { type: String, required: true },
    project_id: { type: String, required: true },
    token: { type: String, required: true, select: false },
    token_hash: { type: String, required: true, select: false },
    device_id: { type: String, required: true },
    platform: { type: String, enum: ["android", "ios"], required: true },
    app_version: String,
    is_active: { type: Boolean, default: true },
    last_seen_at: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);
schema.index({ environment: 1, token_hash: 1 }, { unique: true });
schema.index({ environment: 1, device_id: 1 }, { unique: true });
schema.index({ user_id: 1, environment: 1, is_active: 1 });
export default mongoose.model("device_tokens", schema);
