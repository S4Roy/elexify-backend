import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const BlogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    short_description: { type: String },
    content: { type: String, required: true }, // CKEditor HTML
    feature_image: { type: Schema.Types.ObjectId, ref: "medias" }, // or just URL
    gallery: [{ type: Schema.Types.ObjectId, ref: "medias" }], // optional
    related_blogs: [{ type: Schema.Types.ObjectId, ref: "blogs" }], // optional
    tags: [{ type: String }],

    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_by: {
      type: Types.ObjectId,
      ref: "users",
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
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Apply pagination plugin
BlogSchema.plugin(mongooseAggregatePaginate);

// Create model
const BLog = model("blogs", BlogSchema);

export default BLog;
