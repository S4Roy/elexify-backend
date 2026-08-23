import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import slugify from "slugify";

const { Schema, model, Types } = mongoose;

const ShippingClassSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    sort_order: {
      type: Number,
      default: 0,
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
      immutable: true,
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

ShippingClassSchema.pre("validate", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

ShippingClassSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ShippingClassSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ShippingClassSchema.index({ status: 1 });

ShippingClassSchema.plugin(mongooseAggregatePaginate);

const ShippingClass = model("shipping_classes", ShippingClassSchema);
export default ShippingClass;
