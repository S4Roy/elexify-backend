import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const EmailTemplateSchema = new Schema({
  action: { type: String, required: true },
  site_language: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  // getTemplate.js already filters on this — it was missing here, so every
  // lookup silently matched zero documents regardless of what existed.
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
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

// One template per (action, language) — this is also the seed script's
// upsert key (src/scripts/seedEmailTemplates.js).
EmailTemplateSchema.index({ action: 1, site_language: 1 }, { unique: true });

const EmailTemplate = model("email_templates", EmailTemplateSchema);

export default EmailTemplate;
