import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const SubscriberSchema = new Schema(
  {
    email: { type: String, required: false, trim: true, lowercase: true },

    // submission metadata
    source: {
      type: String,
      enum: ["web", "mobile", "api", "widget", "other"],
      default: "web",
    },
    ip: { type: String, default: null },
    user_agent: { type: String, default: null },
    // status & workflow
    status: {
      type: String,
      enum: ["pending", "answered", "archived", "spam"],
      default: "pending",
    },

    // auditing
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes: useful for lookups and admin lists
SubscriberSchema.index({ email: 1 });
SubscriberSchema.index({ created_at: -1 });
SubscriberSchema.index({ ip: 1 });

// Pagination plugin (same as your Consultation schema)
SubscriberSchema.plugin(mongooseAggregatePaginate);

const Subscriber = model("subscribers", SubscriberSchema);
export default Subscriber;
