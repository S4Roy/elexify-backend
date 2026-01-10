import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;
const BlockSchema = new Schema(
  {
    title: { type: String, default: null },
    heading: { type: String, default: null },
    description: { type: String, default: null }, // store HTML
    beej_mantra: { type: String, default: null },
    recommended_chalisa: { type: String, default: null },
    energization_procedure: { type: String, default: null },
    ruling_planet: { type: String, default: null },
    lord_deity: { type: String, default: null },
    chakra_activated: { type: String, default: null },

    // reference to medias collection (store ObjectId)
    image: { type: Types.ObjectId, ref: "medias", default: null },

    // background image / video keys
    bg: { type: Types.ObjectId, ref: "medias", default: null },

    external_url: { type: String, default: null },
  },
  { _id: false } // prevents creating an _id per block when used in parent doc
);
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
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    details: {
      required: { type: Boolean, default: false },
      block_1: { type: BlockSchema, default: () => ({}) },
      block_2: { type: BlockSchema, default: () => ({}) },
      block_3: {
        benefits: { type: String },
        who_should_wear: { type: String },
      },
      block_4: { type: BlockSchema, default: () => ({}) },
      block_5: { type: BlockSchema, default: () => ({}) },
      block_6: { type: BlockSchema, default: () => ({}) },
      block_7: { type: BlockSchema, default: () => ({}) },
      block_8: { type: BlockSchema, default: () => ({}) },
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
