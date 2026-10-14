import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import slugify from "slugify";
import { STOCK_STATUSES } from "../constants/stock.js";
import { deriveStockStatus } from "../services/stock/availability.js";

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
    // On-hand units. May go negative only for allow_backorders SKUs (units
    // owed to customers); services/stock guards every other decrement.
    stock_quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    // On-hand = stock_quantity. Units held by unpaid prepaid orders live in
    // reserved_quantity; available = stock_quantity - reserved_quantity.
    // Both are only ever moved through services/stock (guarded $inc), never
    // written directly — $inc bypasses the `min` validators.
    reserved_quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    manage_stock: {
      type: Boolean,
      default: true,
    },
    allow_backorders: {
      type: Boolean,
      default: false,
    },
    // Derived from the fields above by services/stock deriveStockStatus();
    // stored so list filters / feeds don't have to compute it.
    stock_status: {
      type: String,
      enum: STOCK_STATUSES,
      default: "out_of_stock",
    },
    // Per-SKU low-stock threshold; null falls back to the
    // `low_stock_threshold` site setting.
    low_stock_threshold: {
      type: Number,
      min: 0,
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
    rarity: {
      type: String,
    },
    shipping_class: {
      type: Types.ObjectId,
      ref: "shipping_classes",
      default: null,
    },
    cod_status: {
      type: String,
      enum: ["use_global", "allowed", "disallowed"],
      default: "use_global",
    },
    prepaid_only: { type: Boolean, default: false },
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

// Keep the stored stock_status derived whenever a document is saved
// (create, import, legacy paths). Atomic updates go through services/stock,
// which refreshes it in the same update.
ProductVariationSchema.pre("save", function (next) {
  this.stock_status = deriveStockStatus(this);
  next();
});

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
ProductVariationSchema.add({ zoho_item_id: String, zoho_organization_id: String, hsn_sac: String, accounting_unit: String, zoho_tax_id: String });
const ProductVariation = model("product_variations", ProductVariationSchema);

export default ProductVariation;
