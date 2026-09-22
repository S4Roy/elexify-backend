// Default SMS templates, seeded into models/SmsTemplate.js by
// services/smsTemplate/seedRunner.js (never overwrites an existing row —
// see runSeedSmsTemplates). Copy and message_id below are exactly what's
// currently approved on the Fast2SMS DLT portal for sender ID "ELXFY" —
// do not edit the `message` text or `variables` count/order without also
// re-registering the change with the DLT entity, or the telecom operator
// will silently filter the message.
//
// Only events with real DLT approval are listed here.
export const TEMPLATE_DEFAULTS_VERSION = 5;

export const TEMPLATES = {
  // Available for explicit selection; not automatically dispatched by an event.
  return_initiated: {
    category: "transactional",
    message:
      "Dear {#VAR#}, return for your Elexify order {#VAR#} has been initiated.",
    variables: ["name", "order_id"],
    dlt_message_id: "189208",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  // Available for explicit selection; not automatically dispatched by an event.
  order_placed_alternate_189209: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your Elexify.online order {#VAR#} has been successfully placed. It will be shipped soon. Thank you for shopping with us. - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "189209",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  // Available for explicit selection; not automatically dispatched by an event.
  order_placed_alternate: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your elexify.online order {#VAR#} has been successfully placed. It will be shipped soon. Thank you for shopping with us. - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "189212",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  return_requested: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your return request {#VAR#} has been received. We will review it shortly. - ELEXIFY",
    variables: ["name", "return_request_number"],
    dlt_message_id: "225945",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  return_rejected: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your return request {#VAR#} could not be approved. Please contact support for details. - ELEXIFY",
    variables: ["name", "return_request_number"],
    dlt_message_id: "225944",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  return_completed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your return request {#VAR#} is now complete. Thank you for shopping with elexify.online. - ELEXIFY",
    variables: ["name", "return_request_number"],
    dlt_message_id: "225943",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  account_login: {
    category: "security",
    message:
      "Dear {#VAR#}, a new login to your elexify.online account was detected. If this wasn't you, please contact support immediately. - ELEXIFY",
    variables: ["name"],
    dlt_message_id: "225942",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  // Available for explicit selection; not automatically dispatched by an event.
  mobile_already_registered: {
    category: "security",
    message:
      "Dear {#VAR#}, this mobile number is already registered with us. Please log in using this number to continue. – ELEXIFY",
    variables: ["name"],
    dlt_message_id: "225941",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  // Available for explicit selection; not automatically dispatched by an event.
  payment_failed_detailed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your payment of ₹ {#VAR#} for Order ID {#VAR#} has failed. If the amount is debited, please wait 2 hours — we will process your order or refund it. If not debited, please try to pay again. For help, contact 9110976419. – ELEXIFY",
    variables: ["name", "payment_amount", "order_id"],
    dlt_message_id: "225940",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  // Available for explicit selection; not automatically dispatched by an event.
  order_packed_alternate: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your elexify.online order {#VAR#} has been packed and is ready for dispatch. We’ll notify you once it is shipped. Thank you for shopping with us! - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "189326",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  payment_success: {
    category: "transactional",
    message:
      "Dear {#VAR#}, payment of Rs. {#VAR#} received for your elexify.online order {#VAR#}. Thank you for shopping with us! - ELEXIFY",
    variables: ["name", "payment_amount", "order_id"],
    dlt_message_id: "225963",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  order_processing: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your elexify.online order {#VAR#} is now being processed. We will notify you once it ships. - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "225962",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  order_out_for_delivery: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your elexify.online order {#VAR#} is out for delivery and will reach you today. - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "225961",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  refund_completed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your refund of Rs. {#VAR#} for elexify.online order {#VAR#} has been credited successfully. - ELEXIFY",
    variables: ["name", "refund_amount", "order_id"],
    dlt_message_id: "225960",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  return_approved: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your return request {#VAR#} has been approved. Please keep the item ready for pickup. - ELEXIFY",
    variables: ["name", "return_request_number"],
    dlt_message_id: "225959",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  return_received: {
    category: "transactional",
    message:
      "Dear {#VAR#}, we have received the item for your return request {#VAR#}. Refund will be processed after inspection. - ELEXIFY",
    variables: ["name", "return_request_number"],
    dlt_message_id: "225958",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  return_updated: {
    category: "transactional",
    message:
      "Dear {#VAR#}, status of your return request {#VAR#} has been updated to {#VAR#}. - ELEXIFY",
    variables: ["name", "return_request_number", "return_status"],
    dlt_message_id: "225957",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  payment_failed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your payment for elexify.online order {#VAR#} has failed. Please retry or use another payment method. - ELEXIFY",
    variables: ["name", "order_id"],
    dlt_message_id: "225948",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  order_shipped: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your elexify.online order {#VAR#} has been shipped. Track it using AWB {#VAR#}. - ELEXIFY",
    variables: ["name", "order_id", "tracking_number"],
    dlt_message_id: "225947",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  refund_initiated: {
    category: "transactional",
    message:
      "Dear {#VAR#}, a refund of Rs. {#VAR#} has been initiated for your elexify.online order {#VAR#}. It will reflect in 5-7 working days. - ELEXIFY",
    variables: ["name", "refund_amount", "order_id"],
    dlt_message_id: "225946",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  order_placed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your Elexify order {#VAR#} has been successfully placed. We’ll notify you once it’s shipped. Thank you for shopping with us!",
    variables: ["name", "order_id"],
    dlt_message_id: "189210",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  order_packed: {
    category: "transactional",
    message:
      '"Dear {#VAR#}, your elexify.online order {#VAR#} has been packed and is ready for dispatch. We’ll notify you once it is shipped. Thank you for shopping with us! - ELEXIFY',
    variables: ["name", "order_id"],
    dlt_message_id: "189327",
    is_unicode: true,
  },
  order_cancelled: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your Elexify order {#VAR#} has been cancelled. If payment was made, refund will be processed within 5–7 working days.",
    variables: ["name", "order_id"],
    dlt_message_id: "189213",
    sender_id: "ELXFY",
    is_unicode: true,
  },
  order_delivered: {
    category: "transactional",
    message:
      "Dear {#VAR#}, your Elexify order {#VAR#} has been successfully delivered. We hope you loved it! Thank you for shopping with us.",
    variables: ["name", "order_id"],
    dlt_message_id: "189211",
    sender_id: "ELXFY",
    is_unicode: false,
  },
  // Used for every OTP purpose except an existing user logging in — see
  // controllers/auth/sendOtpToUser.js's is_otp_login branch.
  otp_generic: {
    category: "otp",
    message:
      "Dear {#VAR#}, Your {#VAR#} OTP is {#VAR#}. Please do not share this SMS to any one. ELEXIFY.",
    variables: ["name", "purpose", "otp"],
    dlt_message_id: "189215",
    is_unicode: false,
  },
  // Existing-user login only — a separate, shorter DLT template (single
  // variable) rather than reusing otp_generic with a "Login" purpose label.
  otp_login: {
    category: "otp",
    message:
      "Your OTP for login to elexify.online is {#VAR#}. Do not share this OTP with anyone. It is valid for 2 minutes. - ELEXIFY",
    variables: ["otp"],
    dlt_message_id: "189214",
    is_unicode: false,
  },
  mobile_changed: {
    category: "transactional",
    message:
      "Dear {#VAR#}, the mobile number on your elexify.online account has been changed. If you did not do this, contact support immediately. - ELEXIFY",
    variables: ["name"],
    dlt_message_id: "226002",
    sender_id: "ELXFY",
    is_unicode: false,
  },
};
