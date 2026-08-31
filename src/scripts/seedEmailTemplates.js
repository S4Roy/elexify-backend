// Bootstraps the `email_templates` collection so notification delivery
// actually works out of the box in a fresh environment (previously: zero
// templates existed and every send silently failed — see
// services/emailTemplate/getTemplate.js + models/EmailTemplate.js).
//
// Safe to re-run: upserts by (action, site_language) using $setOnInsert
// only — an existing row (including one an admin has since customized) is
// never touched.
//
// Usage: node src/scripts/seedEmailTemplates.js

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import EmailTemplate from "../models/EmailTemplate.js";
import { NOTIFICATION_EVENTS } from "../constants/notificationEvents.js";

const LANGUAGE = "en";

// Minimal, functional default copy — admins can replace subject/body from
// the existing EmailTemplate admin UI at any time; re-running this script
// afterward will not overwrite their changes.
const TEMPLATES = {
  otp: {
    subject: "Your OTP Code",
    body: "<p>Hi {{name}}, your one-time code for {{purpose}} is <strong>{{otp}}</strong>. It expires in {{expiry}} minutes. If you didn't request this, you can ignore this email.</p>",
  },
  password_reset: {
    subject: "Reset your password",
    body: '<p>Hi {{name}}, click <a href="{{reset_link}}">here</a> to reset your password. If you didn\'t request this, you can ignore this email.</p>',
  },
  order_placed: {
    subject: "Order Confirmed — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> has been placed successfully.</p>",
  },
  payment_success: {
    subject: "Payment Received — {{order_id}}",
    body: "<p>Hi {{name}}, we've received your payment for order <strong>{{order_id}}</strong>.</p>",
  },
  payment_failed: {
    subject: "Payment Failed — {{order_id}}",
    body: "<p>Hi {{name}}, your payment for order <strong>{{order_id}}</strong> could not be processed. Please try again.</p>",
  },
  order_processing: {
    subject: "Order Processing — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> is being processed.</p>",
  },
  order_shipped: {
    subject: "Order Shipped — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> has shipped.</p>",
  },
  order_out_for_delivery: {
    subject: "Out for Delivery — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> is out for delivery.</p>",
  },
  order_delivered: {
    subject: "Order Delivered — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> has been delivered. We hope you love it!</p>",
  },
  order_cancelled: {
    subject: "Order Cancelled — {{order_id}}",
    body: "<p>Hi {{name}}, your order <strong>{{order_id}}</strong> has been cancelled.</p>",
  },
  refund_initiated: {
    subject: "Refund Initiated — {{order_id}}",
    body: "<p>Hi {{name}}, a refund for order <strong>{{order_id}}</strong> has been initiated and will reflect in your account soon.</p>",
  },
  refund_completed: {
    subject: "Refund Completed — {{order_id}}",
    body: "<p>Hi {{name}}, your refund for order <strong>{{order_id}}</strong> has been completed.</p>",
  },
  account_login: {
    subject: "New login to your account",
    body: "<p>Hi {{name}}, we noticed a new login to your account.</p>",
  },
  password_changed: {
    subject: "Your password was changed",
    body: "<p>Hi {{name}}, your account password was just changed. If this wasn't you, please contact support immediately.</p>",
  },
  email_changed: {
    subject: "Your account email was changed",
    body: "<p>Hi {{name}}, your account email was just changed. If this wasn't you, please contact support immediately.</p>",
  },
  mobile_changed: {
    subject: "Your account mobile number was changed",
    body: "<p>Hi {{name}}, your account mobile number was just changed. If this wasn't you, please contact support immediately.</p>",
  },
  suspicious_activity: {
    subject: "Suspicious activity detected",
    body: "<p>Hi {{name}}, we detected unusual activity on your account. If this wasn't you, please secure your account immediately.</p>",
  },
  promotional_offer: {
    subject: "A special offer just for you",
    body: "<p>Hi {{name}}, check out our latest offers and discounts.</p>",
  },
  back_in_stock: {
    subject: "Back in stock!",
    body: "<p>Hi {{name}}, an item on your wishlist is back in stock.</p>",
  },
  price_drop: {
    subject: "Price drop alert",
    body: "<p>Hi {{name}}, an item on your wishlist just dropped in price.</p>",
  },
  abandoned_cart: {
    subject: "You left something in your cart",
    body: "<p>Hi {{name}}, you have items waiting in your cart. Complete your purchase before they sell out.</p>",
  },
};

// Add every notification-registry templateKey too, in case the registry
// grows a key this hand-authored map hasn't caught up with yet.
for (const { templateKey } of Object.values(NOTIFICATION_EVENTS)) {
  if (!TEMPLATES[templateKey]) {
    TEMPLATES[templateKey] = {
      subject: templateKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      body: `<p>Hi {{name}}, this is a notification: ${templateKey}.</p>`,
    };
  }
}

const run = async () => {
  await mongooseConnection;

  const ops = Object.entries(TEMPLATES).map(([action, { subject, body }]) => ({
    updateOne: {
      filter: { action, site_language: LANGUAGE },
      update: {
        $setOnInsert: {
          action,
          site_language: LANGUAGE,
          subject,
          body,
          status: "active",
          created_at: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await EmailTemplate.bulkWrite(ops, { ordered: false });
  console.log(
    `Email templates seeded: ${result.upsertedCount} created, ${ops.length - result.upsertedCount} already existed (untouched).`
  );

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
