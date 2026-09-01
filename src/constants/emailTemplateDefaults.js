// Default (subject, preheader, body, required_variables) copy per
// EmailTemplate `action`, used to seed a fresh environment
// (scripts/seedEmailTemplates.js) and to audit template rendering in
// tests. Pure data — no side effects — so it can be imported without
// opening a Mongo connection.
//
// `body` is a small content snippet, not a full HTML document — the
// shared EmailShell (services/email/emailLayout.js) wraps every render
// with the actual header/container/footer. Bodies compose the shared
// component partials registered in services/email/emailComponents.js
// (`{{> ctaButton ...}}`, `{{> orderSummaryCard}}`, etc.) rather than
// hand-rolling markup, so every transactional email shares one visual
// language by construction.
import { NOTIFICATION_EVENTS } from "./notificationEvents.js";

// Bumped when the design-modernization pass rewrote every default
// template's content — new environments seed at this version;
// scripts/upgradeEmailTemplatesToV2.js is the one-time, explicit migration
// for environments that already had the pre-redesign defaults seeded.
export const TEMPLATE_DEFAULTS_VERSION = 2;

const h1 = (text) => `<h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;color:#1f2933;">${text}</h1>`;
const p = (text) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:#1f2933;">${text}</p>`;
const small = (text) => `<p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#52606d;">${text}</p>`;

const orderShell = ({ heading, badgeLabel, badgeTone = "brand", message, extra = "", showAddress = false, ctaText = "View Order" }) => `
${h1(heading)}
${p("Hi {{name}},")}
{{> statusBadge label="${badgeLabel}" tone="${badgeTone}"}}
${p(message)}
{{> orderSummaryCard}}
${showAddress ? `{{> addressBlock heading="Shipping Address" address=shipping_address}}` : ""}
${extra}
{{> ctaButton url=view_order_url text="${ctaText}"}}
`.trim();

const securityShell = ({ heading, message, cta = "" }) => `
${h1(heading)}
${p("Hi {{name}},")}
${p(message)}
${small("If this wasn't you, please secure your account immediately or contact support.")}
${cta}
`.trim();

// Minimal, functional default copy — admins can replace subject/preheader/
// body from the existing EmailTemplate admin UI at any time; re-running
// the seed script afterward will not overwrite their changes.
export const TEMPLATES = {
  otp: {
    subject: "Your OTP Code",
    preheader: "Use this code to verify — it expires in {{expiry}} minutes.",
    body: `
${h1("Verify Your Account")}
${p("Hi {{name}},")}
${p("Use this verification code for {{purpose}}:")}
{{> otpCodeBlock code=otp}}
${small("Expires in {{expiry}} minutes.")}
{{> infoBox tone="warn" text="Do not share this code with anyone, including Elexify staff."}}
`.trim(),
    required_variables: ["name", "purpose", "otp", "expiry"],
    is_marketing: false,
  },
  password_reset: {
    subject: "Reset your password",
    preheader: "Reset your Elexify account password.",
    body: `
${h1("Reset Your Password")}
${p("Hi {{name}},")}
${p("We received a request to reset your password. Click below to choose a new one.")}
{{> ctaButton url=reset_link text="Reset Password"}}
${small("If you didn't request this, you can safely ignore this email.")}
`.trim(),
    required_variables: ["name", "reset_link"],
    is_marketing: false,
  },
  order_placed: {
    subject: "Order Confirmed — {{order_id}}",
    preheader: "We've received your order {{order_id}}.",
    body: orderShell({
      heading: "Order Confirmed",
      badgeLabel: "Order Confirmed",
      message: "Thank you for shopping with us! We've received your order and it's being prepared.",
      extra: `{{#if is_cod}}{{> infoBox text="This order is Cash on Delivery — pay the courier when your order arrives."}}{{else}}{{> infoBox text="Payment received — thank you!"}}{{/if}}`,
      showAddress: true,
    }),
    required_variables: ["name", "order_id", "order_number", "grand_total"],
    is_marketing: false,
  },
  payment_success: {
    subject: "Payment Received — {{order_id}}",
    preheader: "We've received your payment for order {{order_id}}.",
    body: orderShell({
      heading: "Payment Successful",
      badgeLabel: "Payment Successful",
      message: "We've received your payment for the order below.",
    }),
    required_variables: ["name", "order_id", "order_number", "grand_total"],
    is_marketing: false,
  },
  payment_failed: {
    subject: "Payment Failed — {{order_id}}",
    preheader: "We couldn't complete your payment for order {{order_id}}.",
    body: orderShell({
      heading: "Payment Unsuccessful",
      badgeLabel: "Payment Failed",
      badgeTone: "warn",
      message: "We couldn't complete your payment for the order below. No amount has been deducted for this attempt.",
      ctaText: "Retry Payment",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  order_processing: {
    subject: "Order Processing — {{order_id}}",
    preheader: "We're preparing your order {{order_id}}.",
    body: orderShell({
      heading: "We're Preparing Your Order",
      badgeLabel: "Processing",
      message: "Your order is being prepared and will be handed to our courier partner soon.",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  order_shipped: {
    subject: "Your Order Has Shipped — {{order_id}}",
    preheader: "Your order {{order_id}} is on the way.",
    body: orderShell({
      heading: "Your Order Is On The Way",
      badgeLabel: "Shipped",
      message: "Good news — your order has shipped!",
      extra: `{{#if tracking_number}}${small('Courier: {{courier_name}} &middot; Tracking No: {{tracking_number}}')}{{/if}}`,
      ctaText: "Track Order",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  order_out_for_delivery: {
    subject: "Out for Delivery — {{order_id}}",
    preheader: "Your order {{order_id}} is out for delivery.",
    body: orderShell({
      heading: "Out for Delivery",
      badgeLabel: "Out for Delivery",
      message: "Your order is out for delivery and should arrive soon.",
      extra: `{{#if tracking_number}}${small('Courier: {{courier_name}} &middot; Tracking No: {{tracking_number}}')}{{/if}}`,
      ctaText: "Track Order",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  order_delivered: {
    subject: "Order Delivered — {{order_id}}",
    preheader: "Your order {{order_id}} has been delivered.",
    body: orderShell({
      heading: "Delivered Successfully",
      badgeLabel: "Delivered",
      message: "Your order has been delivered. We hope you love it!",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  order_cancelled: {
    subject: "Order Cancelled — {{order_id}}",
    preheader: "Your order {{order_id}} has been cancelled.",
    body: orderShell({
      heading: "Order Cancelled",
      badgeLabel: "Cancelled",
      badgeTone: "warn",
      message: "Your order has been cancelled as requested.",
      extra: `{{#if is_cod}}{{> infoBox text="This was a Cash on Delivery order, so no payment refund is required."}}{{else}}{{> infoBox text="A refund has been initiated for this order and will reflect in your account soon."}}{{/if}}`,
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  refund_initiated: {
    subject: "Refund Initiated — {{order_id}}",
    preheader: "Your refund for order {{order_id}} has been initiated.",
    body: orderShell({
      heading: "Refund Initiated",
      badgeLabel: "Refund Initiated",
      message: "We've initiated your refund. The amount may take several business days to appear, depending on your bank or payment provider.",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  refund_completed: {
    subject: "Refund Completed — {{order_id}}",
    preheader: "Your refund for order {{order_id}} has been completed.",
    body: orderShell({
      heading: "Refund Completed",
      badgeLabel: "Refund Completed",
      message: "Your refund has been completed.",
    }),
    required_variables: ["name", "order_id", "order_number"],
    is_marketing: false,
  },
  account_login: {
    subject: "New login to your account",
    preheader: "We noticed a new login to your Elexify account.",
    body: securityShell({
      heading: "New Login Detected",
      message: "We noticed a new login to your account.",
    }),
    required_variables: ["name"],
    is_marketing: false,
  },
  password_changed: {
    subject: "Your password was changed",
    preheader: "Your Elexify account password was just changed.",
    body: securityShell({
      heading: "Password Changed",
      message: "Your account password was just changed.",
      cta: `{{> ctaButton url=account_url text="Secure My Account"}}`,
    }),
    required_variables: ["name", "account_url"],
    is_marketing: false,
  },
  email_changed: {
    subject: "Your account email was changed",
    preheader: "Your Elexify account email was just changed.",
    body: securityShell({
      heading: "Email Address Changed",
      message: "Your account email was just changed to {{new_email}}.",
      cta: `{{> ctaButton url=account_url text="Secure My Account"}}`,
    }),
    required_variables: ["name", "new_email", "account_url"],
    is_marketing: false,
  },
  mobile_changed: {
    subject: "Your account mobile number was changed",
    preheader: "Your Elexify account mobile number was just changed.",
    body: securityShell({
      heading: "Mobile Number Changed",
      message: "Your account mobile number was just changed.",
      cta: `{{> ctaButton url=account_url text="Secure My Account"}}`,
    }),
    required_variables: ["name", "account_url"],
    is_marketing: false,
  },
  suspicious_activity: {
    subject: "Suspicious activity detected",
    preheader: "We detected unusual activity on your Elexify account.",
    body: securityShell({
      heading: "Suspicious Activity Detected",
      message: "We detected unusual activity on your account.",
      cta: `{{> ctaButton url=account_url text="Secure My Account"}}`,
    }),
    required_variables: ["name", "account_url"],
    is_marketing: false,
  },
  promotional_offer: {
    subject: "A special offer just for you",
    preheader: "Check out our latest offers and discounts.",
    body: `
${h1("A Special Offer Just For You")}
${p("Hi {{name}},")}
${p("Check out our latest offers and discounts.")}
{{> ctaButton url=storefront_url text="Shop Now"}}
`.trim(),
    required_variables: ["name", "storefront_url"],
    is_marketing: true,
  },
  back_in_stock: {
    subject: "Back in stock!",
    preheader: "An item on your wishlist is back in stock.",
    body: `
${h1("Back In Stock")}
${p("Hi {{name}},")}
${p("An item on your wishlist is back in stock.")}
{{> ctaButton url=storefront_url text="Shop Now"}}
`.trim(),
    required_variables: ["name", "storefront_url"],
    is_marketing: true,
  },
  price_drop: {
    subject: "Price drop alert",
    preheader: "An item on your wishlist just dropped in price.",
    body: `
${h1("Price Drop Alert")}
${p("Hi {{name}},")}
${p("An item on your wishlist just dropped in price.")}
{{> ctaButton url=storefront_url text="Shop Now"}}
`.trim(),
    required_variables: ["name", "storefront_url"],
    is_marketing: true,
  },
  abandoned_cart: {
    subject: "You left something in your cart",
    preheader: "You have items waiting in your cart.",
    body: `
${h1("You Left Something Behind")}
${p("Hi {{name}},")}
${p("You have items waiting in your cart. Complete your purchase before they sell out.")}
{{> ctaButton url=storefront_url text="Complete Purchase"}}
`.trim(),
    required_variables: ["name", "storefront_url"],
    is_marketing: true,
  },
};

// Add every notification-registry templateKey too, in case the registry
// grows a key this hand-authored map hasn't caught up with yet.
for (const { templateKey } of Object.values(NOTIFICATION_EVENTS)) {
  if (!TEMPLATES[templateKey]) {
    TEMPLATES[templateKey] = {
      subject: templateKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      preheader: "",
      body: `${h1(templateKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}\n${p("Hi {{name}}, this is a notification: " + templateKey + ".")}`,
      required_variables: ["name"],
      is_marketing: false,
    };
  }
}
