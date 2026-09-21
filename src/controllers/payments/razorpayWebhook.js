import crypto from "crypto";
import Order from "../../models/Order.js";
import ReturnRequest from "../../models/ReturnRequest.js";
import WebhookEvent from "../../models/WebhookEvent.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { orderService, notificationService } from "../../services/index.js";
import { recordOperationalEvent } from "../../services/observability/recordOperationalEvent.js";
import { getRazorpayConfig } from "../../services/integrationCredentials/razorpay.js";
import { recordRazorpayDelivery } from "../../services/webhooks/recordRazorpayDelivery.js";

const MAX_WEBHOOK_ATTEMPTS = 5;

const processEvent = async (event, audit = {}) => {
  audit.handled = false;
  const refund = event?.payload?.refund?.entity;
  const payment = event?.payload?.payment?.entity;
  const refundId = refund?.id;
  const paymentId = refund?.payment_id || payment?.id;

  if (event?.event === "payment.captured" && payment) {
    audit.handled = true;
    const order = await Order.findOne({ "payment_meta.razorpay_order_id": payment.order_id });
    if (!order) throw new Error("No local order matches captured payment");
    audit.order_id = String(order._id || order.id);
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
  } else if (["refund.processed", "refund.failed"].includes(event?.event) && (refundId || paymentId)) {
    audit.handled = true;
    const returnRequest = await ReturnRequest.findOne({
      $or: [
        ...(refundId ? [{ "refund.provider_ref": refundId }] : []),
        ...(refund?.receipt ? [{ "refund.idempotency_key": refund.receipt }] : []),
      ],
    });
    if (returnRequest) {
      audit.order_id = String(returnRequest.order_id);
      const processed = event.event === "refund.processed";
      returnRequest.status = processed ? "completed" : "refund_failed";
      returnRequest.refund.status = processed ? "processed" : "failed";
      returnRequest.refund.provider_ref = refundId || returnRequest.refund.provider_ref;
      returnRequest.refund.failure_reason = processed ? null : (refund?.error_description || "Refund failed at Razorpay");
      returnRequest.refund.processed_at = processed ? new Date() : null;
      await returnRequest.save();
      const returnOrder = await Order.findById(returnRequest.order_id);
      if (returnOrder) {
        const fullRefund = returnRequest.refund.amount >= returnOrder.grand_total;
        await Order.updateOne({ _id: returnOrder._id }, { $set: { payment_status: processed ? (fullRefund ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED) : PAYMENT_STATUS.REFUND_FAILED } });
        if (processed) notificationService.sendOrderNotification({ order: returnOrder, event: "REFUND_COMPLETED", data: { refund_amount: returnRequest.refund.amount }, dedupeKey: `${returnRequest.request_number}:REFUND_COMPLETED` });
      }
      return;
    }
    if (event?.event === "refund.processed") {
    const order = await Order.findOne({
      $or: [{ "refund.razorpay_refund_id": refundId }, { "payment_meta.razorpay_payment_id": paymentId }],
    });
    if (!order) throw new Error("No local order matches refund");
    audit.order_id = String(order._id || order.id);
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
    } else {
    const order = await Order.findOne({
      $or: [{ "refund.razorpay_refund_id": refundId }, { "payment_meta.razorpay_payment_id": paymentId }],
    });
    if (!order) throw new Error("No local order matches failed refund");
    audit.order_id = String(order._id || order.id);
    await orderService.transitionOrder({
      orderId: order._id,
      paymentStatus: PAYMENT_STATUS.REFUND_FAILED,
      set: {
        "refund.status": "failed",
        "refund.failure_reason": refund?.error_description || "Refund failed at Razorpay",
      },
    });
    }
  }
};

export const replayRazorpayWebhook = async (eventId, audit = {}) => {
  const inbox = await WebhookEvent.findOneAndUpdate(
    { event_id: eventId, status: { $in: ["received", "failed"] }, attempts: { $lt: MAX_WEBHOOK_ATTEMPTS } },
    { $set: { status: "processing", last_error: null }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!inbox) return null;
  audit.attempts = inbox.attempts;
  audit.processing_state = "processing";
  try {
    await processEvent(inbox.payload, audit);
    const completed = await WebhookEvent.findByIdAndUpdate(
      inbox._id,
      { $set: { status: "completed", processed_at: new Date(), last_error: null, next_retry_at: null } },
      { new: true },
    );
    audit.processing_state = completed ? "completed" : "processing";
    audit.next_retry_at = null;
    return completed;
  } catch (error) {
    const exhausted = inbox.attempts >= MAX_WEBHOOK_ATTEMPTS;
    audit.processing_state = exhausted ? "dead_letter" : "failed";
    audit.next_retry_at = exhausted ? null : new Date(Date.now() + Math.min(60_000 * 2 ** inbox.attempts, 3_600_000));
    await WebhookEvent.updateOne(
      { _id: inbox._id },
      { $set: {
        status: exhausted ? "dead_letter" : "failed",
        last_error: String(error?.message || error).slice(0, 1000),
        next_retry_at: audit.next_retry_at,
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
  const receivedAt = new Date();
  const audit = { event_id: req.headers["x-razorpay-event-id"] };
  const respond = (statusCode, body, detail = body.message, outcome) => {
    audit.detail = detail;
    if (outcome) audit.outcome = outcome;
    void recordRazorpayDelivery({ event: req.body, audit, statusCode, receivedAt });
    return res.status(statusCode).json(body);
  };
  const signature = req.headers["x-razorpay-signature"];
  let credentials;
  try {
    credentials = await getRazorpayConfig();
  } catch {
    return respond(503, { status: "error", message: "Payment provider unavailable" });
  }
  const secret = credentials.webhook_secret;
  if (typeof signature !== "string" || !secret || !req.rawBody) {
    audit.signature_verified = false;
    return respond(400, { status: "error", message: "Missing signature" });
  }
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const valid = /^[a-f0-9]{64}$/i.test(signature) &&
    crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  audit.signature_verified = valid;
  if (!valid) return respond(400, { status: "error", message: "Invalid signature" });

  const event = req.body;
  if (credentials.account_id && event?.account_id !== credentials.account_id) {
    return respond(400, { status: "error", message: "Webhook account mismatch" });
  }
  const payloadHash = crypto.createHash("sha256").update(req.rawBody).digest("hex");
  const eventId = req.headers["x-razorpay-event-id"] || event?.id || event?.event_id || `${event?.event}:${payloadHash}`;
  audit.event_id = eventId;
  audit.payload_hash = payloadHash;
  if (typeof event?.event !== "string" || !event.event) {
    return respond(400, { status: "error", message: "Invalid event" });
  }
  try {
    let inbox = await WebhookEvent.findOne({ event_id: eventId });
    audit.duplicate = !!inbox;
    // Records created by the previous inbox schema represent events that were
    // already acknowledged; preserve that history during rolling deployment.
    if (inbox && !inbox.status) {
      return respond(200, { status: "success", message: "Legacy event already processed" }, "Legacy event already processed", "ignored");
    }
    if (inbox && inbox.payload_hash !== payloadHash) {
      return respond(409, { status: "error", message: "Event payload mismatch" });
    }
    if (!inbox) {
      try {
        inbox = await WebhookEvent.create({
          event_id: eventId, event_type: event.event, payload: event,
          payload_hash: payloadHash, status: "received",
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        audit.duplicate = true;
        inbox = await WebhookEvent.findOne({ event_id: eventId });
      }
    }
    if (!inbox) throw new Error("Webhook inbox unavailable");
    // Recheck after a concurrent insert as well as the initial lookup.
    if (inbox.payload_hash !== payloadHash) {
      return respond(409, { status: "error", message: "Event payload mismatch" });
    }
    audit.processing_state = inbox.status;
    audit.attempts = inbox.attempts;
    audit.next_retry_at = inbox.next_retry_at;
    if (inbox.status === "completed") {
      return respond(200, { status: "success", message: "Already processed" }, "Duplicate delivery; event already processed", "ignored");
    }
    const processed = await replayRazorpayWebhook(eventId, audit);
    if (!processed) return respond(409, { status: "processing" }, "Event is processing or unavailable for retry");
    return respond(200, { status: "success" },
      audit.handled ? "Event processed" : "Event type or payload not handled; acknowledged without changes",
      audit.handled ? "processed" : "ignored");
  } catch (error) {
    console.error("❌ razorpayWebhook error:", error?.message || error);
    return respond(500, { status: "error", message: "Webhook processing failed" });
  }
};
