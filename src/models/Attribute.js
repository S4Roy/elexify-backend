import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const AttributeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    image: {
      type: Types.ObjectId,
      ref: "medias", // 🔹 Reference to Media Model
      default: null,
    },
    visible_in_list: {
      type: Boolean,
      default: true,
    },
    size_meta: {
      type: Boolean,
      default: false,
    },
    customized_mala_mukhi: {
      type: Boolean,
      default: false,
    },
    customized_mala_design: {
      type: Boolean,
      default: false,
    },
    customized_mala_type: {
      type: Boolean,
      default: false,
    },

    // fields added to your AttributeSchema
    display_type: {
      type: String,
      enum: ["dropdown", "radio", "image"],
      default: "dropdown",
    },
    // optionally: default sort order for values
    values_sort_by: {
      type: String,
      enum: ["sort_order", "name"],
      default: "sort_order",
    },

    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: {
      type: Date,
      default: Date.now,
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
AttributeSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted_at: null },
    background: true,
  }
);
AttributeSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted_at: null },
    background: true,
  }
);
// Apply pagination plugin
AttributeSchema.plugin(mongooseAggregatePaginate);

// Create model
const Attribute = model("attributes", AttributeSchema);

export default Attribute;
