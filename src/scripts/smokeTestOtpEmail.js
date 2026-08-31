// Sends one real OTP email through the configured SMTP provider using the
// (now-seeded) "otp" EmailTemplate, to verify the full template→SMTP
// handoff actually works end to end — not mocked, not a unit test.
//
// This can only confirm the SMTP server ACCEPTED the message for delivery
// (a 250 response from the mail transaction) — it cannot confirm the
// message actually landed in the recipient's inbox (that needs someone to
// check the mailbox). Never logs the OTP value itself.
//
// Usage: node src/scripts/smokeTestOtpEmail.js [recipient@example.com]

import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { emailService } from "../services/index.js";
import { generalHelper } from "../helpers/index.js";

const recipient = process.argv[2] || process.env.SMOKE_TEST_EMAIL;

if (!recipient) {
  console.error("Usage: node src/scripts/smokeTestOtpEmail.js <recipient@example.com>");
  console.error("(or set SMOKE_TEST_EMAIL)");
  process.exit(1);
}

const run = async () => {
  await mongooseConnection;

  const otp = generalHelper.generateOtp(6);
  console.log(`Sending a real OTP email to ${generalHelper.maskEmail(recipient)} via the configured SMTP provider...`);

  const delivered = await emailService.sendEmail(recipient, "otp", "YOUR OTP CODE", "en", {
    name: "Smoke Test",
    otp,
    expiry: 10,
    purpose: "smoke test",
  });

  await mongoose.disconnect();

  if (delivered) {
    console.log("PASS — SMTP accepted the message. (Inbox delivery itself must be confirmed manually.)");
    process.exit(0);
  } else {
    console.error("FAIL — sendEmail returned false. Check the 'otp' EmailTemplate exists (run npm run seed:email-templates) and SMTP_* env vars.");
    process.exit(1);
  }
};

run().catch((e) => {
  console.error("FAIL —", e.message);
  process.exit(1);
});
