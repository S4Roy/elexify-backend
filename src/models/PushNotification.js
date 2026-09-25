import { PUSH_TYPES } from "../services/notification/push/templates.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "users", required: true },
    type: { type: String, enum: PUSH_TYPES, required: true },
    category: {
      type: String,
      enum: ["transactional", "security", "marketing"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    image_url: String,
    route: String,
    data: { type: Map, of: String },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    campaign_id: {
      type: Schema.Types.ObjectId,
      ref: "push_campaigns",
      default: null,
    },
    dedupe_key: String,
    environment: { type: String, required: true },
    read_at: { type: Date, default: null },
    expires_at: { type: Date, required: true },
    queued: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);
schema.index(
  { user_id: 1, dedupe_key: 1 },
  { unique: true, partialFilterExpression: { dedupe_key: { $type: "string" } } }
);
schema.index({ user_id: 1, environment: 1, _id: -1 });
schema.index({ user_id: 1, environment: 1, read_at: 1 });
schema.index({ environment: 1, queued: 1, expires_at: 1 });
schema.index({ campaign_id: 1 });
export default mongoose.model("push_notifications", schema);
