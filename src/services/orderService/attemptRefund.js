import Order from "../../models/Order.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { refundRazorpayPayment, fetchRazorpayPayment } from "../paymentService/refundRazorpayPayment.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";
import { notificationService } from "../index.js";

// Shared by cancelOrder (first attempt) and retryRefund (admin retry).
// Idempotent: never issues a second Razorpay refund for an order that
// already has one, and always claims the "processing" state atomically
// before calling out to Razorpay so a crash mid-call leaves a clearly
// recoverable state (refund_pending/refund_failed) rather than a false
// "paid" order that was actually refunded upstream.
export const attemptRefund = async (order) => {
  if (order.refund?.razorpay_refund_id) {
    // A refund already exists for this order — never create a second one.
    return order;
  }

  const idempotencyKey = order.refund?.idempotency_key || `${order.id}-refund`;

  // Claim: move into "processing" atomically. If this order is retried
  // concurrently (double-click on Retry Refund, or a race with cancelOrder),
  // only one caller wins this claim.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      payment_status: { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUND_FAILED] },
      "refund.razorpay_refund_id": { $in: [null, undefined] },
    },
    {
      $set: {
        payment_status: PAYMENT_STATUS.REFUND_PENDING,
        "refund.status": "processing",
        "refund.attempted_at": new Date(),
        "refund.idempotency_key": idempotencyKey,
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Someone else already claimed this refund attempt (or a refund id
    // showed up in the meantime) — re-fetch and return the current state
    // rather than proceeding, so we never issue a duplicate refund call.
    return Order.findById(order._id);
  }

  notificationService
    .sendNotification({
      userId: claimed.user,
      event: "REFUND_INITIATED",
      data: { order_id: claimed.id },
      dedupeKey: `${claimed.id}:REFUND_INITIATED`,
    })
    .catch(() => {});

  const razorpayPaymentId = claimed.payment_meta?.razorpay_payment_id;

  try {
    if (!razorpayPaymentId) {
      throw new Error("No Razorpay payment id recorded on this order.");
    }

    // Refund the exact amount Razorpay actually captured, never a locally
    // recomputed figure — avoids any drift from currency conversion,
    // rounding, or partial-capture edge cases.
    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    const amountInPaise = payment?.amount;
    if (!amountInPaise) {
      throw new Error("Could not determine captured payment amount.");
    }

    const refundResponse = await refundRazorpayPayment(
      razorpayPaymentId,
      amountInPaise,
      idempotencyKey
    );

    const isProcessed = refundResponse?.status === "processed";

    if (isProcessed) {
      // Guard against a race with the webhook, which may confirm this same
      // refund independently — whichever write lands second is a no-op.
      await Order.findOneAndUpdate(
        { _id: claimed._id, payment_status: { $ne: PAYMENT_STATUS.REFUNDED } },
        {
          $set: {
            payment_status: PAYMENT_STATUS.REFUNDED,
            "refund.razorpay_refund_id": refundResponse.id,
            "refund.razorpay_payment_id": razorpayPaymentId,
            "refund.amount": (refundResponse.amount ?? amountInPaise) / 100,
            "refund.status": "processed",
            "refund.completed_at": new Date(),
          },
        }
      );
      notificationService
        .sendNotification({
          userId: claimed.user,
          event: "REFUND_COMPLETED",
          data: { order_id: claimed.id },
          dedupeKey: `${claimed.id}:REFUND_COMPLETED`,
        })
        .catch(() => {});
    } else {
      await Order.updateOne(
        { _id: claimed._id },
        {
          $set: {
            "refund.razorpay_refund_id": refundResponse.id,
            "refund.razorpay_payment_id": razorpayPaymentId,
            "refund.amount": (refundResponse?.amount ?? amountInPaise) / 100,
            "refund.status": "processing",
          },
        }
      );
    }

    return Order.findById(order._id);
  } catch (err) {
    console.error("❌ Razorpay refund attempt failed:", err?.message || err);
    await Order.updateOne(
      { _id: claimed._id },
      {
        $set: {
          payment_status: PAYMENT_STATUS.REFUND_FAILED,
          "refund.status": "failed",
          "refund.failure_reason": err?.message || "Refund could not be initiated.",
        },
      }
    );
    await recordOperationalEvent({
      eventType: "refund_failed", correlationId: claimed.id,
      summary: "Razorpay refund attempt failed",
      metadata: { order_id: claimed.id, reason: err?.message || "Refund could not be initiated" },
    }).catch(() => undefined);
    return Order.findById(order._id);
  }
};
