import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

// Singleton document (find the single row with SeoSettings.getSingleton()).
const SeoSettingsSchema = new Schema(
  {
    site_name: { type: String, default: "Elexify" },
    product_title_template: {
      type: String,
      default: "{productName} | {categoryName} | {siteName}",
    },
    product_description_template: {
      type: String,
      default:
        "Buy {productName} online. Explore {categoryName} with quality products, secure ordering and reliable delivery.",
    },
    title_min_length: { type: Number, min: 0, default: 50 },
    title_max_length: { type: Number, min: 0, default: 60 },
    description_min_length: { type: Number, min: 0, default: 140 },
    description_max_length: { type: Number, min: 0, default: 160 },
    updated_at: { type: Date, default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { versionKey: false },
);

SeoSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

const SeoSettings = model("seo_settings", SeoSettingsSchema);
export default SeoSettings;
