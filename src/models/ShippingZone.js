import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ShippingZoneSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // numeric ids referencing the `countries`/`states` collections
    countries: [{ type: Number, ref: "countries" }],
    states: [{ type: Number, ref: "states" }],
    // optional fine-grained override, e.g. ["11", "12"] matches postcodes starting with those digits
    pincode_prefixes: [{ type: String, trim: true }],
    // fallback zone used when nothing else matches an address
    is_default: {
      type: Boolean,
      default: false,
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

ShippingZoneSchema.index({ status: 1 });
ShippingZoneSchema.index({ is_default: 1 });
ShippingZoneSchema.index({ countries: 1 });
ShippingZoneSchema.index({ states: 1 });

ShippingZoneSchema.plugin(mongooseAggregatePaginate);

const ShippingZone = model("shipping_zones", ShippingZoneSchema);
export default ShippingZone;
