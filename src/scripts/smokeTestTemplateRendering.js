// Sends real, non-production "Order Cancelled" and "Refund Initiated"
// emails through the actual EmailTemplate → renderEmailTemplate → SMTP
// path, to verify the subject-rendering fix end to end (not mocked). Uses
// a synthetic test order id — never touches a real customer's order or
// resends a real production notification.
//
// Usage: node src/scripts/smokeTestTemplateRendering.js [recipient@example.com]

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { emailService } from "../services/index.js";
import { generalHelper } from "../helpers/index.js";

const recipient = process.argv[2] || process.env.SMOKE_TEST_EMAIL;

if (!recipient) {
  console.error("Usage: node src/scripts/smokeTestTemplateRendering.js <recipient@example.com>");
  console.error("(or set SMOKE_TEST_EMAIL)");
  process.exit(1);
}

const testOrderId = `TEST-ORD-${Date.now()}`;

const run = async () => {
  await mongooseConnection;

  console.log(`Sending real template-rendering smoke test emails to ${generalHelper.maskEmail(recipient)} for test order ${testOrderId}...`);

  const results = {};
  results.order_cancelled = await emailService.sendEmail(recipient, "order_cancelled", undefined, "en", {
    name: "Template Rendering Smoke Test",
    order_id: testOrderId,
  });
  results.refund_initiated = await emailService.sendEmail(recipient, "refund_initiated", undefined, "en", {
    name: "Template Rendering Smoke Test",
    order_id: testOrderId,
  });

  await mongoose.disconnect();

  console.log(JSON.stringify(results, null, 2));
  console.log(
    `Expected subjects — check the recipient inbox manually:\n` +
      `  Order Cancelled — ${testOrderId}\n` +
      `  Refund Initiated — ${testOrderId}`
  );

  if (!results.order_cancelled || !results.refund_initiated) {
    console.error("FAIL — one or both sends returned false.");
    process.exit(1);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("FAIL —", e.message);
  process.exit(1);
});
