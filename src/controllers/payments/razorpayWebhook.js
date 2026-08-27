import crypto from "crypto";
import { envs } from "../../config/index.js";
import Order from "../../models/Order.js";
import WebhookEvent from "../../models/WebhookEvent.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";

// Razorpay's synchronous refund-API response can already be "processed" by
// the time our own request returns, and the webhook for that same refund
// can also arrive within milliseconds — both paths write with a
// payment_status:{$ne:"refunded"} guard, so whichever lands second is a
// safe no-op rather than a duplicate/racy write.
export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = envs.razorpay.webhook_secret;

    if (!signature || !secret || !req.rawBody) {
      return res.status(400).json({ status: "error", message: "Missing signature" });
    }

    const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    if (expected !== signature) {
      return res.status(400).json({ status: "error", message: "Invalid signature" });
    }

    const event = req.body;
    const eventId = event?.id || event?.event_id;

    if (eventId) {
      try {
        await WebhookEvent.create({
          event_id: eventId,
          event_type: event?.event,
          payload: event,
        });
      } catch (err) {
        // Duplicate key = already processed this exact event before.
        if (err?.code === 11000) {
          return res.status(200).json({ status: "success", message: "Already processed" });
        }
        throw err;
      }
    }

    const refundEntity = event?.payload?.refund?.entity;
    const paymentEntity = event?.payload?.payment?.entity;
    const refundId = refundEntity?.id;
    const paymentId = refundEntity?.payment_id || paymentEntity?.id;

    if (event?.event === "refund.processed" && (refundId || paymentId)) {
      await Order.findOneAndUpdate(
        {
          $or: [
            { "refund.razorpay_refund_id": refundId },
            { "payment_meta.razorpay_payment_id": paymentId },
          ],
          payment_status: { $ne: PAYMENT_STATUS.REFUNDED },
        },
        {
          $set: {
            payment_status: PAYMENT_STATUS.REFUNDED,
            "refund.razorpay_refund_id": refundId,
            "refund.status": "processed",
            "refund.completed_at": new Date(),
          },
        }
      );
    } else if (event?.event === "refund.failed" && (refundId || paymentId)) {
      await Order.findOneAndUpdate(
        {
          $or: [
            { "refund.razorpay_refund_id": refundId },
            { "payment_meta.razorpay_payment_id": paymentId },
          ],
        },
        {
          $set: {
            payment_status: PAYMENT_STATUS.REFUND_FAILED,
            "refund.status": "failed",
            "refund.failure_reason": refundEntity?.error_description || "Refund failed at Razorpay",
          },
        }
      );
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("❌ razorpayWebhook error:", error);
    // Still 200 — Razorpay retries aggressively on non-2xx, and we've
    // already logged this for manual follow-up.
    return res.status(200).json({ status: "error" });
  }
};
