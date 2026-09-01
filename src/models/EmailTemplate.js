import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const EmailTemplateSchema = new Schema({
  action: { type: String, required: true },
  site_language: { type: String, required: true },
  subject: { type: String, required: true },
  // Hidden inbox-preview text (renders in a display:none block ahead of
  // the visible body) — additive, defaults to "" so existing rows/tests
  // that predate this field keep working unchanged.
  preheader: { type: String, default: "" },
  body: { type: String, required: true },
  // The canonical variable contract for this event (e.g. ["name",
  // "order_id"]) — used by renderEmailTemplate.js to fail loudly (dead-letter
  // via TEMPLATE_ERROR) if a caller's substitutions are missing something
  // the template needs, on top of the plain-{{var}} auto-detection it
  // already does.
  required_variables: { type: [String], default: [] },
  // Marketing-flavored templates get a "manage communication preferences"
  // footer link; mandatory transactional templates (order/payment/security)
  // do not.
  is_marketing: { type: Boolean, default: false },
  // Bumped by the seed script whenever its own default copy for this
  // action changes, so a future re-seed can report "your customized
  // template predates version N" without ever overwriting it.
  template_version: { type: Number, default: 1 },
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
