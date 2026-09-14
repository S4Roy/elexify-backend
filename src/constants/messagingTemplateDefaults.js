// Documentation-only sample copy for the SMS (Fast2SMS DLT) and WhatsApp
// (Meta Business) messages behind each notification event. Neither channel
// can send free text at request time — SMS on the "dlt" route requires a
// pre-registered message_id (see config/envs.js FAST2SMS.message_ids), and
// WhatsApp requires a pre-approved template name (see whatsapp.provider.js
// TEMPLATE_NAME_MAP). This file is what to hand the DLT/Meta template
// registration form, not something the app reads at runtime — it exists so
// the registered copy and the code's variable order
// (notificationEvents.js `messagingVariables`) are authored and reviewed
// together instead of drifting apart.
//
// {{1}}, {{2}}, ... are positional — they map index-for-index onto each
// event's `messagingVariables` array. Keep both in sync: adding/reordering
// a variable here means updating notificationEvents.js too.
export const SMS_SAMPLE_COPY = {
  order_placed: "Hi {{1}}, your Elexify order {{2}} worth Rs.{{3}} is confirmed. We'll notify you as it ships. - Elexify",
  payment_success: "Hi {{1}}, payment received for order {{2}} (Rs.{{3}}). Thank you for shopping with Elexify!",
  payment_failed: "Hi {{1}}, payment for order {{2}} could not be completed. No amount was deducted. Please retry on the app. - Elexify",
  order_processing: "Hi {{1}}, your Elexify order {{2}} is being prepared and will ship soon.",
  order_shipped: "Hi {{1}}, your Elexify order {{2}} has shipped. Tracking No: {{3}}. Track it in the app.",
  order_out_for_delivery: "Hi {{1}}, your Elexify order {{2}} is out for delivery and should arrive today.",
  order_delivered: "Hi {{1}}, your Elexify order {{2}} has been delivered. We hope you love it!",
  order_cancelled: "Hi {{1}}, your Elexify order {{2}} has been cancelled as requested.",
  refund_initiated: "Hi {{1}}, a refund of Rs.{{3}} has been initiated for order {{2}}. It may take a few business days to reflect.",
  refund_completed: "Hi {{1}}, your refund of Rs.{{3}} for order {{2}} is complete.",
  return_requested: "Hi {{1}}, we've received your return request {{2}}. We'll update you after review. - Elexify",
  return_approved: "Hi {{1}}, your return request {{2}} has been approved. Pickup details will follow.",
  return_rejected: "Hi {{1}}, there's an update on your return request {{2}}. Please check the app for details.",
  return_received: "Hi {{1}}, your returned item(s) for request {{2}} reached our warehouse and are being inspected.",
  return_completed: "Hi {{1}}, your return {{2}} has been processed. Check the app for refund details.",
  return_updated: "Hi {{1}}, update on your return request {{2}}: {{3}}.",
  account_login: "Hi {{1}}, we noticed a new login to your Elexify account. Not you? Secure your account immediately.",
  password_changed: "Hi {{1}}, your Elexify account password was just changed. Contact support if this wasn't you.",
  mobile_changed: "Hi {{1}}, your Elexify account mobile number was just changed. Contact support if this wasn't you.",
  suspicious_activity: "Hi {{1}}, we detected unusual activity on your Elexify account. Please review your account immediately.",
  promotional_offer: "Hi {{1}}, a special offer is live on Elexify. Open the app to check it out!",
  back_in_stock: "Hi {{1}}, an item on your Elexify wishlist is back in stock. Grab it before it's gone!",
  price_drop: "Hi {{1}}, an item on your Elexify wishlist just dropped in price. Check it out now!",
};

export const WHATSAPP_SAMPLE_COPY = {
  ...SMS_SAMPLE_COPY,
  // WhatsApp allows longer, friendlier copy than SMS's ~160-char budget —
  // override only where that's worth doing; everything else reuses the SMS
  // line as a reasonable default starting point for the Meta submission.
  abandoned_cart: "Hi {{1}}, you left something behind in your Elexify cart. Complete your purchase before it sells out!",
};
