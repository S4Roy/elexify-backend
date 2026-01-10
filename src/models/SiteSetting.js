import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const SiteSettingSchema = new Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: Types.ObjectId,
    default: null,
  },
  updated_at: {
    type: Date,
    default: null,
  },
  updated_by: {
    type: Types.ObjectId,
    default: null,
  },
});
const SiteSetting = model("site_settings", SiteSettingSchema);

export default SiteSetting;
