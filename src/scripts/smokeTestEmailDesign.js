// Sends real, non-production emails for the 8 representative events the
// design-modernization checkpoint asks for, through the full
// EmailTemplate -> renderEmailTemplate -> EmailShell -> SMTP path. Uses a
// synthetic test order id and the same safe fixture shape as the admin
// preview/send-test-email feature — never a real customer's order or a
// resend of a real production notification, so it can never duplicate a
// real customer-facing message.
//
// Usage: node src/scripts/smokeTestEmailDesign.js [recipient@example.com]

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { emailService } from "../services/index.js";
import { generalHelper } from "../helpers/index.js";
import { emailBrand } from "../config/emailBrand.js";

const recipient = process.argv[2] || process.env.SMOKE_TEST_EMAIL;

if (!recipient) {
  console.error("Usage: node src/scripts/smokeTestEmailDesign.js <recipient@example.com>");
  console.error("(or set SMOKE_TEST_EMAIL)");
  process.exit(1);
}

const testOrderId = `TEST-ORD-${Date.now()}`;

const baseOrderData = {
  name: "Email Design Smoke Test",
  order_id: testOrderId,
  order_number: testOrderId,
  order_date: new Date().toDateString(),
  payment_method_label: "Cash on Delivery",
  payment_status_label: "Paid",
  order_status_label: "Confirmed",
  is_cod: true,
  items: [{ product_name: "Smoke Test Product", variation_name: null, quantity: 1, unit_price: 1575, total_price: 1575 }],
  subtotal: 1575,
  discount: 0,
  shipping: 0,
  grand_total: 1575,
  refund_amount: 1575,
  shipping_address: {
    name: "Email Design Smoke Test",
    line1: "123 Test Street",
    line2: null,
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700001",
    country: "India",
  },
  view_order_url: `${emailBrand.ordersUrl}/${testOrderId}`,
  account_url: emailBrand.accountUrl,
  storefront_url: emailBrand.storefrontUrl,
};

const EVENTS = [
  { action: "otp", data: { name: "Email Design Smoke Test", otp: "123456", purpose: "smoke test", expiry: 10 } },
  { action: "order_placed", data: baseOrderData },
  { action: "payment_success", data: baseOrderData },
  { action: "order_shipped", data: { ...baseOrderData, courier_name: "Demo Courier", tracking_number: "DEMO-TRK-1" } },
  { action: "order_cancelled", data: baseOrderData },
  { action: "refund_initiated", data: baseOrderData },
  { action: "refund_completed", data: baseOrderData },
  { action: "password_changed", data: { name: "Email Design Smoke Test" } },
];

const run = async () => {
  await mongooseConnection;

  console.log(`Sending ${EVENTS.length} real email-design smoke test emails to ${generalHelper.maskEmail(recipient)} for test order ${testOrderId}...`);

  const results = {};
  for (const { action, data } of EVENTS) {
    results[action] = await emailService.sendEmail(recipient, action, undefined, "en", data);
  }

  await mongoose.disconnect();

  console.log(JSON.stringify(results, null, 2));

  const failed = Object.entries(results).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`FAIL — ${failed.map(([action]) => action).join(", ")} returned false.`);
    process.exit(1);
  }
  console.log("PASS — all sends accepted by SMTP. Check the recipient inbox manually for layout/branding/subject correctness.");
  process.exit(0);
};

run().catch((e) => {
  console.error("FAIL —", e.message);
  process.exit(1);
});
