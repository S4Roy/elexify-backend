import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    image_url: String,
    route: String,
    audience: { type: String, enum: ["all", "specific"], required: true },
    customer_ids: [{ type: Schema.Types.ObjectId }],
    environment: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "SCHEDULED",
        "PROCESSING",
        "COMPLETED",
        "PARTIALLY_FAILED",
        "FAILED",
        "CANCELLED",
      ],
      default: "DRAFT",
    },
    created_by: { type: Schema.Types.ObjectId, required: true },
    scheduled_at: Date,
    sent_at: Date,
    cancelled_by: Schema.Types.ObjectId,
    cancelled_at: Date,
    requested_recipients: Number,
    cursor: Schema.Types.ObjectId,
    audience_cutoff: Date,
    expanded: { type: Boolean, default: false },
    lease_until: Date,
    lease_id: String,
    expires_at: { type: Date, required: true },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);
schema.index({ environment: 1, status: 1, scheduled_at: 1 });
export default mongoose.model("push_campaigns", schema);
