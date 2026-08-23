import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// Single cohesive settings object (unlike HomePage's array of sections) —
// nested under `draft`/`published` so publish is a one-line deep copy,
// same operation shape as HomePage.publish.
const HeaderSettingsSchema = new Schema(
  {
    logo: {
      image: { type: Types.ObjectId, ref: "medias", default: null },
      alt_text: { type: String, default: null },
      link: { type: String, default: "/" },
    },
    logo_mobile: {
      image: { type: Types.ObjectId, ref: "medias", default: null },
      alt_text: { type: String, default: null },
    },
    // Free-form strings (not enums) — the admin form (Joi) is the gatekeeper
    // for allowed values here, matching how `cta_button.style` below works;
    // keeping the model loose avoids the model/validation drifting out of
    // sync as new layout/background presets get added from the admin side.
    layout: { type: String, default: "classic" },
    sticky: { type: Boolean, default: true },
    sticky_shrink_on_scroll: { type: Boolean, default: true },
    hide_on_scroll_down: { type: Boolean, default: false },
    height_px: { type: Number, default: 80 },
    height_mobile_px: { type: Number, default: 64 },
    background: {
      type: { type: String, default: "color" },
      color: { type: String, default: "#ffffff" },
    },
    visibility: {
      show_topbar: { type: Boolean, default: true },
      show_search: { type: Boolean, default: true },
      show_wishlist: { type: Boolean, default: true },
      show_account: { type: Boolean, default: true },
      show_cart: { type: Boolean, default: true },
    },
    cta_button: {
      enabled: { type: Boolean, default: false },
      label: { type: String, default: null },
      link: { type: String, default: null },
      style: { type: String, default: "primary" },
    },
    search: {
      enabled: { type: Boolean, default: true },
      placeholder: { type: String, default: "Search products..." },
      min_chars: { type: Number, default: 2 },
    },
  },
  { _id: false },
);

const HeaderConfigSchema = new Schema(
  {
    key: { type: String, default: "header_config", unique: true },
    draft: { type: HeaderSettingsSchema, default: () => ({}) },
    published: { type: HeaderSettingsSchema, default: () => ({}) },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    published_at: { type: Date, default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: "updated_at" },
  },
);

HeaderConfigSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: "header_config" });
  if (!doc) {
    doc = await this.create({ key: "header_config" });
  }
  return doc;
};

const HeaderConfig = model("header_configs", HeaderConfigSchema);
export default HeaderConfig;
