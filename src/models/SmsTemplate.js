import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const SmsTemplateSchema = new Schema({
  // Matches constants/notificationEvents.js `templateKey` for order/payment/
  // refund/etc. events, or "otp_login"/"otp_generic" for the OTP flow
  // (which isn't part of that registry — see controllers/auth/sendOtpToUser.js).
  event: { type: String, required: true },
  category: { type: String, default: "transactional" },
  // Exact DLT-approved copy with {#VAR#} placeholders — reference/audit/
  // preview only. Fast2SMS's "dlt" route sends by message_id, not this
  // text, but it must stay byte-identical to what's registered with the
  // telecom DLT entity or the operator will filter the message.
  message: { type: String, required: true },
  // Ordered variable names filled into the {#VAR#} positions above, e.g.
  // ["name", "order_id"] — must match the registered template's variable
  // count and order exactly.
  variables: { type: [String], default: [] },
  // Fast2SMS's numeric DLT template id — this is the actual value sent as
  // `message` in the bulkV2 API call (see services/sms/fast2sms.service.js).
  dlt_message_id: { type: String, required: true },
  // null = fall back to the global config/envs.js FAST2SMS.sender_id.
  sender_id: { type: String, default: null },
  is_unicode: { type: Boolean, default: false },
  template_version: { type: Number, default: 1 },
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

// One template per event — this is also the seed script's upsert key
// (services/smsTemplate/seedRunner.js).
SmsTemplateSchema.index({ event: 1 }, { unique: true });

const SmsTemplate = model("sms_templates", SmsTemplateSchema);

export default SmsTemplate;
