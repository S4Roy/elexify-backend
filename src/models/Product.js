import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import slugify from "slugify";

const { Schema, model, Types } = mongoose;

const ProductSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["simple", "variable"],
      default: "simple",
    },

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
    short_description: {
      type: String,
      default: null,
    },
    brand: {
      type: Types.ObjectId,
      ref: "brands",
      required: false, // Ensure products always have a brand
      default: null,
    },
    categories: [
      {
        type: Types.ObjectId,
        ref: "categories",
        required: true, // Ensure products always have a category
      },
    ],
    sub_categories: [
      {
        type: Types.ObjectId,
        ref: "categories",
        required: false, // Ensure products always have a category
      },
    ],
    tags: [
      {
        type: Types.ObjectId,
        ref: "tags",
        required: false, // Ensure products always have a category
      },
    ],
    classifications: [
      {
        type: Types.ObjectId,
        ref: "classifications",
        required: false, // Ensure products always have a category
      },
    ],
    images: [
      {
        type: Types.ObjectId,
        ref: "medias", // 🔹 Reference to Media Model
      },
    ],
    serial_numbers: [
      {
        type: Types.ObjectId,
        ref: "serial_numbers", // 🔹 Reference to Serial Numbers Model
        sparse: true, // Allows null/undefined values,
        default: null,
      },
    ],
    // Only for 'simple' products
    regular_price: {
      type: Number,
      min: 0,
      default: null,
    },
    sale_price: {
      type: Number,
      min: 0,
      default: null,
    },
    stock_quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    sku: {
      type: String,
      unique: true, // Ensure SKU is unique
      sparse: true, // Allows null/undefined values
      trim: true,
    },
    weight: {
      type: Number, // in kg
      default: 0,
    },
    dimensions: {
      length: { type: Number, default: 0 }, // in cm
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    seo: {
      type: Types.ObjectId,
      ref: "seo", // 🔹 Reference to SEO Model
      default: null,
    },
    shipping_class: {
      type: Types.ObjectId,
      ref: "shipping_classes",
      default: null,
    },
    avg_rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    total_reviews: {
      type: Number,
      min: 0,
      default: 0,
    },
    power_level: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    ask_for_price: {
      type: Boolean,
      default: false,
    },
    enable_enquiry: {
      type: Boolean,
      default: false,
    },
    rarity: {
      type: String,
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
      default: Date.now,
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

// 🔹 Automatically generate slug only when `name` changes
ProductSchema.pre("validate", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

// 🔹 Indexing for faster queries
ProductSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ProductSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ProductSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ProductSchema.index({ status: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ meta_title: 1 });
ProductSchema.index({ meta_keywords: 1 });

// 🔹 Separate unique sparse index on `serial_numbers`
ProductSchema.index({ serial_numbers: 1 }, { unique: true, sparse: true });

// 🔹 Apply pagination plugin
ProductSchema.plugin(mongooseAggregatePaginate);

// Create model
const Product = model("products", ProductSchema);

export default Product;
