import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    notification_id: { type: Schema.Types.ObjectId, required: true },
    device_id: { type: Schema.Types.ObjectId, required: true },
    user_id: { type: Schema.Types.ObjectId, required: true },
    campaign_id: { type: Schema.Types.ObjectId, default: null },
    token_hash: String,
    status: {
      type: String,
      enum: ["PENDING", "SUBMITTED", "FAILED", "SKIPPED"],
      default: "PENDING",
    },
    attempts: { type: Number, default: 0 },
    provider_message_id: String,
    error_code: String,
    submitted_at: Date,
    failed_at: Date,
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);
schema.index({ notification_id: 1, device_id: 1 }, { unique: true });
schema.index({ campaign_id: 1, status: 1 });
export default mongoose.model("push_deliveries", schema);
