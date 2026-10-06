import mongoose from "mongoose";

const { Schema, model } = mongoose;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// One release policy per platform, managed from Admin → Settings → App Updates.
// Installed version < minimum_version → forced update (blocking dialog).
// Installed version < latest_version → optional update (dialog with "Later").
const MobileUpdatePolicySchema = new Schema(
  {
    platform: { type: String, enum: ["android", "ios"], required: true, unique: true },
    enabled: { type: Boolean, default: false },
    latest_version: { type: String, match: semver, default: "0.0.0" },
    minimum_version: { type: String, match: semver, default: "0.0.0" },
    store_url: { type: String, default: null },
    title: { type: String, trim: true, maxlength: 80, default: "" },
    message: { type: String, trim: true, maxlength: 300, default: "" },
    remind_after_hours: { type: Number, min: 0, max: 720, default: 24 },
    // Storefront footer "Get the app" badge + QR for this platform.
    show_on_website: { type: Boolean, default: false },
    updated_by: { type: Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, versionKey: false }
);

export default model("mobile_update_policies", MobileUpdatePolicySchema);
