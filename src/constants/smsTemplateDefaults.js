// Default SMS templates, seeded into models/SmsTemplate.js by
// services/smsTemplate/seedRunner.js (never overwrites an existing row —
// see runSeedSmsTemplates). Copy and message_id below are exactly what's
// currently approved on the Fast2SMS DLT portal for sender ID "ELXFY" —
// do not edit the `message` text or `variables` count/order without also
// re-registering the change with the DLT entity, or the telecom operator
// will silently filter the message.
//
// Only events with real DLT approval are listed here. Every other
// notification event (order_shipped, payment_success, refund_*, etc.)
// intentionally has no SMS template yet — adding fabricated copy would
// send unapproved text through the "dlt" route and get blocked.
export const TEMPLATE_DEFAULTS_VERSION = 1;

export const TEMPLATES = {
  order_placed: {
    category: "transactional",
    message: "Dear {#VAR#}, your elexify.online order {#VAR#} has been successfully placed. It will be shipped soon. Thank you for shopping with us!",
    variables: ["name", "order_id"],
    dlt_message_id: "189210",
    is_unicode: true,
  },
  order_packed: {
    category: "transactional",
    message: "Dear {#VAR#}, your elexify.online order {#VAR#} has been packed and is ready for dispatch. We'll notify you once it is shipped. Thank you for shopping with us! - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "189327",
    is_unicode: true,
  },
  order_cancelled: {
    category: "transactional",
    message: "Dear {#VAR#}, your Elexify order {#VAR#} has been cancelled. If payment was made, refund will be processed within 5-7 working days.",
    variables: ["name", "order_id"],
    dlt_message_id: "189213",
    is_unicode: true,
  },
  order_delivered: {
    category: "transactional",
    message: "Dear {#VAR#}, your elexify.online order {#VAR#} has been successfully delivered. We hope you loved it! Thank you for shopping with us.",
    variables: ["name", "order_id"],
    dlt_message_id: "189212",
    is_unicode: true,
  },
  // Used for every OTP purpose except an existing user logging in — see
  // controllers/auth/sendOtpToUser.js's is_otp_login branch.
  otp_generic: {
    category: "otp",
    message: "Dear {#VAR#}, Your {#VAR#} OTP is {#VAR#}. Please do not share this SMS to any one. ELEXIFY.",
    variables: ["name", "purpose", "otp"],
    dlt_message_id: "189215",
    is_unicode: false,
  },
  // Existing-user login only — a separate, shorter DLT template (single
  // variable) rather than reusing otp_generic with a "Login" purpose label.
  otp_login: {
    category: "otp",
    message: "Your OTP for login to elexify.online is {#VAR#}. Do not share this OTP with anyone. It is valid for 2 minutes. - ELEXIFY",
    variables: ["otp"],
    dlt_message_id: "189214",
    is_unicode: false,
  },
};
