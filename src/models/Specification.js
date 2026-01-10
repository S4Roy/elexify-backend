import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const SpecificationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // e.g. "mukhi_count"
    label: { type: String, required: true }, // e.g. "Mukhi Count"
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "number",
        "dropdown",
        "boolean",
        "multiselect",
        "date",
        "richtext",
      ],
    },
    unit: { type: String, default: null }, // e.g. "g", "mm"
    options: {
      type: [String],
      default: [],
    },
    validation: {
      min: Number,
      max: Number,
      step: Number,
      regex: String, // stringified regex
    },
    group: { type: String, default: null }, // UI grouping
    sort_order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true }, // show on product page or not
    required: { type: Boolean, default: false }, // enforce on product create

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

// 🔹 Apply pagination plugin
SpecificationSchema.plugin(mongooseAggregatePaginate);

// Create model
const Specification = model("specifications", SpecificationSchema);

export default Specification;
