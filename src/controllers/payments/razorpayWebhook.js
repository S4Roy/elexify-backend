import crypto from "crypto";
import Order from "../../models/Order.js";
import WebhookEvent from "../../models/WebhookEvent.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { orderService, notificationService } from "../../services/index.js";
import { recordOperationalEvent } from "../../services/observability/recordOperationalEvent.js";
import { getRazorpayConfig } from "../../services/integrationCredentials/razorpay.js";

const MAX_WEBHOOK_ATTEMPTS = 5;

const processEvent = async (event) => {
  const refund = event?.payload?.refund?.entity;
  const payment = event?.payload?.payment?.entity;
  const refundId = refund?.id;
  const paymentId = refund?.payment_id || payment?.id;

  if (event?.event === "payment.captured" && payment) {
    const order = await Order.findOne({ "payment_meta.razorpay_order_id": payment.order_id });
    if (!order) throw new Error("No local order matches captured payment");
    const result = await orderService.finalizeCapturedPayment({
      orderId: order.id, paymentData: payment, source: "webhook",
    });
    if (!result.alreadyFinalized) {
      notificationService
        .sendOrderNotification({
          order: result.order,
          event: "PAYMENT_SUCCESS",
          dedupeKey: `${result.order.id}:PAYMENT_SUCCESS`,
        });
    }
  } else if (event?.event === "refund.processed" && (refundId || paymentId)) {
    const order = await Order.findOne({
      $or: [{ "refund.razorpay_refund_id": refundId }, { "payment_meta.razorpay_payment_id": paymentId }],
    });
    if (!order) throw new Error("No local order matches refund");
    await orderService.transitionOrder({
      orderId: order._id,
      paymentStatus: PAYMENT_STATUS.REFUNDED,
      set: {
        "refund.razorpay_refund_id": refundId,
        "refund.status": "processed",
        "refund.completed_at": new Date(),
      },
    });
    notificationService.sendOrderNotification({
      order,
      event: "REFUND_COMPLETED",
      data: refund?.amount ? { refund_amount: refund.amount / 100 } : {},
      dedupeKey: `${order.id}:REFUND_COMPLETED`,
    });
  } else if (event?.event === "refund.failed" && (refundId || paymentId)) {
    const order = await Order.findOne({
      $or: [{ "refund.razorpay_refund_id": refundId }, { "payment_meta.razorpay_payment_id": paymentId }],
    });
    if (!order) throw new Error("No local order matches failed refund");
    await orderService.transitionOrder({
      orderId: order._id,
      paymentStatus: PAYMENT_STATUS.REFUND_FAILED,
      set: {
        "refund.status": "failed",
        "refund.failure_reason": refund?.error_description || "Refund failed at Razorpay",
      },
    });
  }
};

export const replayRazorpayWebhook = async (eventId) => {
  const inbox = await WebhookEvent.findOneAndUpdate(
    { event_id: eventId, status: { $in: ["received", "failed"] }, attempts: { $lt: MAX_WEBHOOK_ATTEMPTS } },
    { $set: { status: "processing", last_error: null }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!inbox) return null;
  try {
    await processEvent(inbox.payload);
    return WebhookEvent.findByIdAndUpdate(
      inbox._id,
      { $set: { status: "completed", processed_at: new Date(), last_error: null } },
      { new: true },
    );
  } catch (error) {
    const exhausted = inbox.attempts >= MAX_WEBHOOK_ATTEMPTS;
    await WebhookEvent.updateOne(
      { _id: inbox._id },
      { $set: {
        status: exhausted ? "dead_letter" : "failed",
        last_error: String(error?.message || error).slice(0, 1000),
        next_retry_at: exhausted ? null : new Date(Date.now() + Math.min(60_000 * 2 ** inbox.attempts, 3_600_000)),
      } },
    );
    await recordOperationalEvent({
      eventType: exhausted ? "webhook_dead_letter" : "razorpay_webhook_failed",
      severity: exhausted ? "critical" : "error", correlationId: inbox.event_id,
      summary: exhausted ? "Razorpay webhook exhausted retry attempts" : "Razorpay webhook processing failed",
      metadata: { event_type: inbox.event_type, attempts: inbox.attempts, reason: error?.message },
    }).catch(() => undefined);
    throw error;
  }
};

export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  let credentials;
  try {
    credentials = await getRazorpayConfig();
  } catch {
    return res.status(503).json({ status: "error", message: "Payment provider unavailable" });
  }
  const secret = credentials.webhook_secret;
  if (!signature || !secret || !req.rawBody) {
    return res.status(400).json({ status: "error", message: "Missing signature" });
  }
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const valid = signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return res.status(400).json({ status: "error", message: "Invalid signature" });

  const event = req.body;
  const eventId = event?.id || event?.event_id;
  if (!eventId || !event?.event) {
    return res.status(400).json({ status: "error", message: "Invalid event" });
  }
  const payloadHash = crypto.createHash("sha256").update(req.rawBody).digest("hex");
  try {
    let inbox = await WebhookEvent.findOne({ event_id: eventId });
    // Records created by the previous inbox schema represent events that were
    // already acknowledged; preserve that history during rolling deployment.
    if (inbox && !inbox.status) {
      return res.status(200).json({ status: "success", message: "Legacy event already processed" });
    }
    if (inbox && inbox.payload_hash !== payloadHash) {
      return res.status(409).json({ status: "error", message: "Event payload mismatch" });
    }
    if (!inbox) {
      try {
        inbox = await WebhookEvent.create({
          event_id: eventId, event_type: event.event, payload: event,
          payload_hash: payloadHash, status: "received",
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        inbox = await WebhookEvent.findOne({ event_id: eventId });
      }
    }
    if (inbox.status === "completed") {
      return res.status(200).json({ status: "success", message: "Already processed" });
    }
    const processed = await replayRazorpayWebhook(eventId);
    if (!processed) return res.status(409).json({ status: "processing" });
    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("❌ razorpayWebhook error:", error?.message || error);
    return res.status(500).json({ status: "error", message: "Webhook processing failed" });
  }
};
