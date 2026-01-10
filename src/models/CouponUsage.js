import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const CouponUsageSchema = new Schema(
  {
    coupon: {
      type: Types.ObjectId,
      ref: "coupons",
      required: true,
      index: true,
    },

    user: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    order: {
      type: Types.ObjectId,
      ref: "orders",
      required: true,
    },

    discount_amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: ["applied", "refunded"],
      default: "applied",
    },

    applied_at: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Helps enforce usage_per_email
CouponUsageSchema.index({ coupon: 1, email: 1 });

/* =========================
   PLUGINS
========================== */
CouponUsageSchema.plugin(mongooseAggregatePaginate);

/* =========================
   MODEL
========================== */
const CouponUsage = model("coupon_usages", CouponUsageSchema);
export default CouponUsage;
