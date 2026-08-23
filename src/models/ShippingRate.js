import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ShippingRateSchema = new Schema(
  {
    zone: {
      type: Types.ObjectId,
      ref: "shipping_zones",
      required: true,
    },
    // null = default rate for any shipping class not otherwise covered in this zone
    shipping_class: {
      type: Types.ObjectId,
      ref: "shipping_classes",
      default: null,
    },
    flat_rate: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    per_kg_rate: {
      type: Number,
      min: 0,
      default: 0,
    },
    // kg included in flat_rate before per_kg_rate starts applying
    free_weight_kg: {
      type: Number,
      min: 0,
      default: 0,
    },
    // order subtotal at/above which shipping is free for this rate; null = no threshold
    free_shipping_min_order_value: {
      type: Number,
      min: 0,
      default: null,
    },
    min_delivery_days: {
      type: Number,
      min: 0,
      default: 2,
    },
    max_delivery_days: {
      type: Number,
      min: 0,
      default: 5,
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

ShippingRateSchema.index({ zone: 1, shipping_class: 1 });
ShippingRateSchema.index({ status: 1 });

ShippingRateSchema.plugin(mongooseAggregatePaginate);

const ShippingRate = model("shipping_rates", ShippingRateSchema);
export default ShippingRate;
