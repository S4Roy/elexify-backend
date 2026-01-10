import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const MediaSchema = new Schema(
  {
    reference_id: {
      type: Types.ObjectId,
      refPath: "reference_type", // Dynamic reference
      default: null, // Allows initial upload without reference
    },
    reference_type: {
      type: String,
      enum: [
        "products",
        "categories",
        "brands",
        "users",
        "banners",
        "blogs",
        "attributes",
        "tags",
        "why-choose-us",
      ],
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
      required: true,
    },
    alt_text: {
      type: String,
      trim: true,
      default: "",
    },
    mime_type: {
      type: String,
      trim: true,
      default: "",
    },
    size: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnail: {
      type: String,
      trim: true,
      default: null,
    },
    is_primary: {
      type: Boolean,
      default: false,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true, // Prevents modification
    },
    created_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    updated_at: {
      type: Date,
      default: null,
    },
    updated_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    deleted_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  { versionKey: false }
);

// 🔹 Indexing for faster queries
MediaSchema.index({ reference_id: 1 });
MediaSchema.index({ reference_type: 1 });
MediaSchema.index({ status: 1 });
MediaSchema.index({ is_primary: 1 });

// 🔹 Apply pagination plugin
MediaSchema.plugin(mongooseAggregatePaginate);

// Create model
const Media = model("medias", MediaSchema);

export default Media;
