import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const ProductCustomizationSchema = new Schema(
  {
    /* ===============================
       Base Product (same as variation)
    =============================== */
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },

    /* ===============================
       Combination Type
       (Mala / Bracelet)
    =============================== */
    combination_type: {
      type: Types.ObjectId, // attribute_values
      ref: "attribute_values",
      required: true,
    },

    /* ===============================
       Attribute-like Structure
       (Parallel to variation.attributes)
    =============================== */
    mukhi_items: [
      {
        attribute_id: {
          type: Types.ObjectId, // Mukhi attribute
          ref: "attributes",
          required: true,
        },

        value_id: {
          type: Types.ObjectId, // Mukhi value (5,18,etc)
          ref: "attribute_values",
          required: true,
        },

        bead_size: {
          type: String, // regular | medium | collector | super_collector
          required: true,
        },

        quantity: {
          type: Number,
          min: 1,
          max: 108,
          required: true,
        },

        /* 🔒 PRICE SNAPSHOT (like regular_price) */
        unit_price: {
          type: Number,
          required: true,
        },

        total_price: {
          type: Number,
          required: true,
        },
      },
    ],

    /* ===============================
       Design Variation
       (AttributeValue reference)
    =============================== */
    design_variation: {
      type: Types.ObjectId,
      ref: "attribute_values",
      default: null,
    },

    /* ===============================
       Charges
    =============================== */
    making_charge: {
      type: Number,
      default: 0,
    },

    /* ===============================
       Helpers (Validation / UI)
    =============================== */
    total_beads: {
      type: Number,
      required: true,
    },

    /* ===============================
       🔒 Locked Price
       (Equivalent to variation price)
    =============================== */
    total_price: {
      type: Number,
      required: true,
    },

    /* ===============================
       Buy Now / Temporary
    =============================== */
    is_temporary: {
      type: Boolean,
      default: false,
    },

    expires_at: {
      type: Date,
      default: null,
    },

    /* ===============================
       Audit (same pattern)
    =============================== */
    created_by: {
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
ProductCustomizationSchema.plugin(mongooseAggregatePaginate);
/* ===============================
   Indexes
=============================== */
ProductCustomizationSchema.index({ product: 1 });
ProductCustomizationSchema.index({ is_temporary: 1, expires_at: 1 });

// Create model
const ProductCustomization = model(
  "product_customizations",
  ProductCustomizationSchema
);

export default ProductCustomization;
