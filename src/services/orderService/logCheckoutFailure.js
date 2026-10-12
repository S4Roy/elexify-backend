import mongoose from "mongoose";
import { logger } from "../../config/logger.js";
import CheckoutFailure from "../../models/CheckoutFailure.js";

// Records why a customer couldn't place or pay for an order: one structured
// log line (search "checkout_failed") plus a CheckoutFailure row for the
// admin "Checkout Failures" view. Expected rejections (4xx: stock, coupon,
// consent, total changed…) are warnings; anything else is an error and
// carries its stack.
export function logCheckoutFailure(stage, error, req, context = {}) {
  const status = Number(error?.statusCode) || 500;
  const level = status >= 500 ? "error" : "warning";
  const headers = req?.headers || {};
  const userId = req?.auth?.user_id ? String(req.auth.user_id) : null;
  const entry = {
    stage,
    level,
    status,
    // Razorpay SDK rejections are plain { statusCode, error: { description } }.
    reason: String(error?.message || error?.error?.description || error).slice(0, 1000),
    user_id: userId,
    client: headers["x-client-platform"] || "web",
    app_version: headers["x-app-version"] || null,
    ip: req?.ip || null,
    context,
    error_code: level === "error" && error?.code != null ? String(error.code) : null,
    stack: level === "error" ? error?.stack || null : null,
  };
  const line = { message: `Checkout failed at ${stage}`, event: "checkout_failed", ...entry };
  if (level === "error") logger.error(line);
  else logger.warn(line);

  // Fire-and-forget: a logging failure must never change the checkout response.
  CheckoutFailure.create({
    ...entry,
    user_id: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
  }).catch((saveError) => logger.error({ message: "Failed to save checkout failure", reason: saveError?.message }));
}
