import mongoose from "mongoose";

const { Schema, model } = mongoose;

// Singleton: storefront installable web app (PWA) options, managed from
// Admin → Settings → App Updates → Website.
const WebAppSettingsSchema = new Schema(
  {
    install_prompt_enabled: { type: Boolean, default: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false }
);

WebAppSettingsSchema.statics.getSingleton = async function () {
  return (await this.findOne().lean()) || { install_prompt_enabled: true };
};

export default model("web_app_settings", WebAppSettingsSchema);
