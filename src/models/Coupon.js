import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const CouponSchema = new Schema(
  {
    /* =========================
       BASIC COUPON INFO
    ========================== */
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: null,
    },

    /* =========================
       DISCOUNT CONFIG
    ========================== */
    discount_type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },

    max_discount_amount: {
      type: Number,
      default: null, // Applies only to percentage coupons
    },

    min_cart_value: {
      type: Number,
      default: 0,
    },

    /* =========================
       APPLICABLE USER TYPE
    ========================== */
    applicable_for: {
      type: String,
      enum: ["user", "channel_partner", "both"],
      required: true,
    },

    /* =========================
       APPLICABLE SCOPE
       (Industry-standard)
    ========================== */
    applicable_scope: {
      type: String,
      enum: ["all", "product", "variation", "category", "brand"],
      default: "all",
    },

    applicable_products: [
      {
        type: Types.ObjectId,
        ref: "products",
      },
    ],

    applicable_variations: [
      {
        type: Types.ObjectId,
        ref: "product_variations",
      },
    ],

    applicable_categories: [
      {
        type: Types.ObjectId,
        ref: "categories",
      },
    ],

    applicable_brands: [
      {
        type: Types.ObjectId,
        ref: "brands",
      },
    ],

    /* =========================
       USAGE RULES
    ========================== */
    usage_limit: {
      type: Number,
      default: null, // Global usage limit
    },

    usage_per_email: {
      type: Number,
      default: 1,
    },

    total_used: {
      type: Number,
      default: 0,
    },

    single_use_per_order: {
      type: Boolean,
      default: true, // Enforce one coupon per order
    },

    /* =========================
       DATE VALIDITY
    ========================== */
    start_date: {
      type: Date,
      required: true,
    },

    end_date: {
      type: Date,
      required: true,
    },

    /* =========================
       EXCLUSIONS & FLAGS
    ========================== */
    exclude_sale_items: {
      type: Boolean,
      default: false,
    },

    exclude_ask_for_price: {
      type: Boolean,
      default: true,
    },

    exclude_enquiry_products: {
      type: Boolean,
      default: true,
    },

    /* =========================
       STATUS & AUDIT
    ========================== */
    status: {
      type: String,
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

/* =========================
   INDEXES (CRITICAL)
========================== */
CouponSchema.index({ code: 1 });
CouponSchema.index({ status: 1, deleted_at: 1 });
CouponSchema.index({ applicable_scope: 1 });
CouponSchema.index({ start_date: 1, end_date: 1 });

/* =========================
   PLUGINS
========================== */
CouponSchema.plugin(mongooseAggregatePaginate);

/* =========================
   MODEL
========================== */
const Coupon = model("coupons", CouponSchema);
export default Coupon;
