import mongoose from "../config/mongoose.js";
import { replayRazorpayWebhook } from "../controllers/payments/razorpayWebhook.js";

const eventId = process.argv[2];
if (!eventId) {
  console.error("Usage: npm run webhook:replay -- <event_id>");
  process.exitCode = 1;
} else {
  replayRazorpayWebhook(eventId)
    .then((event) => {
      if (!event) throw new Error("Event is completed, processing, or not found");
      console.log(`Webhook ${eventId} completed`);
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
