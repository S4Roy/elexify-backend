import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const AttributeValueSchema = new Schema(
  {
    attribute_id: {
      type: Types.ObjectId,
      ref: "attributes",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      default: null,
    },
    meta: { type: Schema.Types.Mixed, default: null }, // flexible place for price modifiers, sku suffix, translations
    sort_order: {
      type: Number,
      default: 0,
    },
    hex: { type: String, default: null }, // optional color hex for color swatches

    image: {
      type: Types.ObjectId,
      ref: "medias", // 🔹 Reference to Media Model
      default: null,
    },
    // ⭐ NEW FIELD: Price modifier
    price_modifier: {
      type: Number,
      default: 0, // + or - allowed (e.g. -50 discount)
    },

    // ⭐ NEW FIELD: Price type
    price_type: {
      type: String,
      enum: ["fixed", "percent"],
      default: "fixed",
    },
    visible_in_list: { type: Boolean, default: true }, // show on product list page or not
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: { type: Date, default: Date.now },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_at: { type: Date, default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { versionKey: false }
);
AttributeValueSchema.index(
  { attribute: 1, slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
AttributeValueSchema.index({ attribute: 1, name: 1 });

// Apply pagination plugin
AttributeValueSchema.plugin(mongooseAggregatePaginate);

// Create model
const AttributeValue = model("attribute_values", AttributeValueSchema);

export default AttributeValue;
