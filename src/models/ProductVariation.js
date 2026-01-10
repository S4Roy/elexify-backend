import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import slugify from "slugify";

const { Schema, model, Types } = mongoose;

const ProductVariationSchema = new Schema(
  {
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },
    combination_key: {
      type: String,
      required: true,
      index: true,
    },
    combination_display: {
      type: String,
      default: null,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    attributes: [
      {
        attribute_id: {
          type: Types.ObjectId,
          ref: "attributes",
          required: true,
        },
        value_id: {
          type: Types.ObjectId,
          ref: "attribute_values",
          required: true,
        },
      },
    ],

    images: [
      {
        type: Types.ObjectId,
        ref: "medias", // 🔹 Reference to Media Model
      },
    ],
    ask_for_price: {
      type: Boolean,
      default: false,
    },
    visible_in_list: {
      type: Boolean,
      default: true,
    }, // Visible in Product List or not
    enable_enquiry: {
      type: Boolean,
      default: false,
    },
    regular_price: {
      type: Number,
      required: true,
      min: 0, // Ensure price is non-negative
    },
    sale_price: {
      type: Number,
      min: 0, // Ensure sale price is non-negative
      default: null,
    },
    stock_quantity: {
      type: Number,
      required: true,
      min: 0, // Ensure stock is non-negative
      default: 0,
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
    rarity: {
      type: String,
    },
    shipping_class: {
      type: Types.ObjectId,
      ref: "shipping_classes",
      default: null,
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
ProductVariationSchema.plugin(mongooseAggregatePaginate);
// sku unique only if not deleted
ProductVariationSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

// combination_key unique only if not deleted
ProductVariationSchema.index(
  { combination_key: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ProductVariationSchema.index(
  { product_id: 1, "attributes.attribute_id": 1, "attributes.value_id": 1 },
  { unique: false } // MongoDB cannot ensure strict uniqueness in arrays, but this helps query speed
);

// Create model
const ProductVariation = model("product_variations", ProductVariationSchema);

export default ProductVariation;
