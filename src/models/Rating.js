import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const RatingSchema = new Schema(
  {
    legacy_import: { type: Object, default: undefined },
    // Linked user (required, who wrote the review)
    user: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Linked product_id
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
    },

    variation_id: { type: Types.ObjectId, ref: "product_variations" },

    // Helpful votes (track per user to prevent abuse)
    helpful_votes: [
      {
        user: { type: Types.ObjectId, ref: "users" },
        value: { type: Number, enum: [1, -1] }, // 1 = upvote, -1 = downvote
        voted_at: { type: Date, default: Date.now },
      },
    ],

    // Rating (1–5 stars)
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    // Rating text
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    // Optional images/videos attached to review
    media: [
      {
        type: Types.ObjectId,
        ref: "medias", // 🔹 Reference to Media Model
      },
    ],

    // Status (control moderation)
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },

    // ✅ Auditing fields
    created_at: { type: Date, default: Date.now },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_at: { type: Date, default: Date.now },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { versionKey: false }
);

// Admin pagination sorts before resolving related documents.
RatingSchema.index({ deleted_at: 1, created_at: -1, _id: -1 });
RatingSchema.index({ deleted_at: 1, status: 1, created_at: -1, _id: -1 });
RatingSchema.index({ "legacy_import.source": 1, deleted_at: 1, created_at: -1, _id: -1 });

// Indexes for faster queries
RatingSchema.index({ product_id: 1, status: 1 });
RatingSchema.index(
  { user: 1, product_id: 1, variation_id: 1 },
  {
    unique: true,
    partialFilterExpression: { variation_id: { $exists: true, $ne: null } },
  }
);

RatingSchema.index(
  { user: 1, product_id: 1 },
  { unique: true, partialFilterExpression: { variation_id: null } }
);

// Pagination support
RatingSchema.plugin(mongooseAggregatePaginate);

const Rating = model("product_ratings", RatingSchema);
export default Rating;
