import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const EmailTemplateSchema = new Schema({
  action: { type: String, required: true },
  site_language: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
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

const EmailTemplate = model("email_templates", EmailTemplateSchema);

export default EmailTemplate;
