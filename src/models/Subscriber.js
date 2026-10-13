import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const SubscriberSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },

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
      enum: ["subscribed", "unsubscribed", "suppressed", "pending", "answered", "archived", "spam"],
      default: "subscribed",
    },

    unsubscribe_token: { type: String, select: false },
    unsubscribed_at: { type: Date, default: null },

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
SubscriberSchema.index({ email: 1 }, { unique: true });
SubscriberSchema.index({ created_at: -1 });
SubscriberSchema.index({ ip: 1 });
SubscriberSchema.index({ unsubscribe_token: 1 }, { unique: true, sparse: true });
SubscriberSchema.index({ status: 1, deleted_at: 1, source: 1, _id: 1 });

// Pagination plugin (same as your Consultation schema)
SubscriberSchema.plugin(mongooseAggregatePaginate);

const Subscriber = model("subscribers", SubscriberSchema);
export default Subscriber;
