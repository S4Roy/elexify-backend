import { getRazorpayClient } from "../integrationCredentials/razorpay.js";

// Fetches the actual captured amount for a payment rather than trusting any
// locally recomputed figure — this is the backend-truth source refunds are
// based on.
export const fetchRazorpayPayment = async (razorpayPaymentId) => {
  const razorpay = await getRazorpayClient();
  return razorpay.payments.fetch(razorpayPaymentId);
};

// amountInPaise must be the exact captured amount (or less, for a partial
// refund) — callers are responsible for never trusting a client-supplied
// figure here. idempotencyKey is passed through as a Razorpay refund
// "receipt" so retried refund attempts against the same payment are safe to
// call more than once from our side even if the DB-level dedup check
// (refund.razorpay_refund_id) somehow gets bypassed.
export const refundRazorpayPayment = async (razorpayPaymentId, amountInPaise, idempotencyKey) => {
  const razorpay = await getRazorpayClient();
  return razorpay.payments.refund(razorpayPaymentId, {
    amount: amountInPaise,
    speed: "optimum",
    receipt: idempotencyKey,
  });
};
