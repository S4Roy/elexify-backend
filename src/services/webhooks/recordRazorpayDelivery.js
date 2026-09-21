import WebhookLog from "../../models/WebhookLog.js";

const text = value => typeof value === "string" ? value.slice(0, 255) : null;
const summarizeEntity = entity => {
  if (!entity || typeof entity !== "object") return undefined;
  const summary = {};
  for (const key of ["id", "entity", "order_id", "payment_id", "status", "currency", "method", "error_code", "error_source", "error_step", "error_reason"]) {
    if (typeof entity[key] === "string") summary[key] = text(entity[key]);
  }
  for (const key of ["amount", "amount_refunded", "created_at"]) {
    if (Number.isFinite(entity[key])) summary[key] = entity[key];
  }
  return summary;
};

// A separate, best-effort delivery audit. Never copy signatures, headers,
// contact details, notes, card/bank/UPI details, or arbitrary error messages.
// The processing inbox retains its own payload for idempotency and replay.
export const recordRazorpayDelivery = async ({ event, audit, statusCode, receivedAt }) => {
  const payment = event?.payload?.payment?.entity;
  const refund = event?.payload?.refund?.entity;
  const order = event?.payload?.order?.entity;
  const payload = { event: text(event?.event), payload: {} };
  for (const [kind, entity] of Object.entries({ payment, refund, order })) {
    const summary = summarizeEntity(entity);
    if (summary) payload.payload[kind] = { entity: summary };
  }
  try {
    await WebhookLog.create({
      provider: "razorpay",
      event_type: text(event?.event) || "unknown",
      event_id: text(audit.event_id),
      provider_order_id: text(payment?.order_id || order?.id),
      payment_id: text(payment?.id || refund?.payment_id),
      refund_id: text(refund?.id),
      order_id: audit.order_id || null,
      incoming_status: text(refund?.status || payment?.status || order?.status),
      signature_verified: audit.signature_verified ?? null,
      duplicate: !!audit.duplicate,
      processing_state: audit.processing_state || null,
      attempts: audit.attempts ?? null,
      next_retry_at: audit.next_retry_at || null,
      payload_hash: audit.payload_hash || null,
      outcome: audit.outcome || (statusCode >= 400 ? "error" : "processed"),
      outcome_detail: audit.detail || null,
      status_code: statusCode,
      payload,
      received_at: receivedAt,
      processing_ms: Date.now() - receivedAt.getTime(),
    });
  } catch {
    // Do not leak payloads or let audit availability trigger payment retries.
    console.warn("Razorpay webhook delivery audit write failed");
  }
};
