import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

// Singleton document (find the single row with ShippingSettings.getSingleton()).
const ShippingSettingsSchema = new Schema(
  {
    processing_days_min: { type: Number, min: 0, default: 1 },
    processing_days_max: { type: Number, min: 0, default: 2 },
    // days of week to skip when counting business days: 0=Sun .. 6=Sat
    exclude_weekends: { type: Boolean, default: true },
    weekend_days: { type: [Number], default: [0] },
    holidays: { type: [Date], default: [] },
    // orders placed after this time (HH:mm, server local time) push processing out by 1 day
    order_cutoff_time: { type: String, default: null },
    default_shipping_zone: {
      type: Types.ObjectId,
      ref: "shipping_zones",
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
  },
  { versionKey: false }
);

ShippingSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

const ShippingSettings = model("shipping_settings", ShippingSettingsSchema);
export default ShippingSettings;
