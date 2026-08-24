import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;
const CategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      // unique: true,
    },
    path: { type: String, index: true },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      default: null,
    },
    parent_category: {
      type: Types.ObjectId,
      ref: "categories",
      default: null,
    },
    banner: {
      type: Types.ObjectId,
      ref: "medias", // 🔹 Reference to Media Model
      default: null,
    },
    banner_tag_line: {
      type: String,
      default: null,
    },
    image: {
      type: Types.ObjectId,
      ref: "medias", // 🔹 Reference to Media Model
      default: null,
    },
    sort_order: { type: Number, default: 0 },
    // Drives the storefront's "Top Categories" strip — an admin-curated
    // subset rather than showing all categories inline.
    is_featured: { type: Boolean, default: false },
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
CategorySchema.plugin(mongooseAggregatePaginate);
CategorySchema.index(
  { name: 1, parent_category: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
CategorySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
// Create model
const Category = model("categories", CategorySchema);

export default Category;
