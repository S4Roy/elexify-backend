import { Router } from "express";
import { razorpayWebhook } from "../../controllers/payments/razorpayWebhook.js";

// Mounted directly on the app in server.js, outside the validateApiKey/
// validateAccessToken chains — Razorpay calls this with no knowledge of our
// API key. Security comes from the HMAC signature check in the controller.
const razorpayWebhookRouter = Router();

razorpayWebhookRouter.post("/webhook", razorpayWebhook);

export { razorpayWebhookRouter };
