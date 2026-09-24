import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const AnnouncementSchema = new Schema(
  {
    message: { type: String, required: true },
    icon: { type: String, default: null },
    link: { type: String, default: null },
    target: { type: String, enum: ["_self", "_blank"], default: "_self" },
    // Optional per-announcement overrides — fall back to `message` when null.
    desktop_content: { type: String, default: null },
    mobile_content: { type: String, default: null },
    dismissible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    schedule: {
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

const ContactItemSchema = new Schema(
  {
    icon: { type: String, default: null },
    label: { type: String, required: true },
    link: { type: String, default: null },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

// Bar-level presentation — how the announcements are shown, not what they say.
const SettingsSchema = new Schema(
  {
    // marquee: continuous scrolling ticker · rotate: one at a time, fading ·
    // static: first announcement only.
    display_mode: {
      type: String,
      enum: ["marquee", "rotate", "static"],
      default: "marquee",
    },
    speed: { type: String, enum: ["slow", "normal", "fast"], default: "normal" },
    pause_on_hover: { type: Boolean, default: true },
    // Shows a close (×) button for the whole bar.
    closeable: { type: Boolean, default: true },
    // How long a closed bar stays hidden for that visitor; 0 = until the
    // browser tab is closed. Republishing new content shows it again.
    dismiss_days: { type: Number, default: 1, min: 0, max: 365 },
    separator: { type: String, default: "•" },
    background_color: { type: String, default: null },
    text_color: { type: String, default: null },
  },
  { _id: false },
);

const TopBarSchema = new Schema(
  {
    key: { type: String, default: "top_bar", unique: true },
    // Draft/working copy — what the admin edits.
    announcements: [AnnouncementSchema],
    contact_items: [ContactItemSchema],
    settings: { type: SettingsSchema, default: () => ({}) },
    // Last-published snapshot — what the public API serves.
    published_announcements: [AnnouncementSchema],
    published_contact_items: [ContactItemSchema],
    published_settings: { type: SettingsSchema, default: () => ({}) },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    published_at: { type: Date, default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: "updated_at" },
  },
);

TopBarSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: "top_bar" });
  if (!doc) {
    doc = await this.create({ key: "top_bar" });
  }
  return doc;
};

const TopBar = model("top_bars", TopBarSchema);
export default TopBar;
