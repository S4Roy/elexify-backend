import OperationalEvent from "../../models/OperationalEvent.js";

const ALERTABLE_TYPES = new Set([
  "webhook_dead_letter",
  "provider_reconciliation_failed",
  "refund_failed",
  "illegal_order_transition",
  "illegal_payment_transition",
  "transaction_aborted",
  "carrier_transition_rejected",
]);

export const buildOperationalAlertPayload = (event) => ({
  text: `[Elexify ${String(event.severity || "error").toUpperCase()}] ${event.event_type}: ${event.summary}`,
  event_type: event.event_type,
  severity: event.severity,
  correlation_id: event.correlation_id || null,
  occurrences: event.occurrences,
  first_seen_at: event.first_seen_at,
  last_seen_at: event.last_seen_at,
  event_id: String(event._id),
});

const config = () => ({
  webhookUrl: process.env.OPERATIONS_ALERT_WEBHOOK_URL || "",
  cooldownSeconds: Math.max(60, Number(process.env.OPERATIONS_ALERT_COOLDOWN_SECONDS) || 900),
  transactionAbortThreshold: Math.max(1, Number(process.env.OPERATIONS_TRANSACTION_ABORT_THRESHOLD) || 3),
});

export const deliverOperationalAlert = async (event, webhookUrl = config().webhookUrl) => {
  if (!webhookUrl) return { status: "not_configured" };
  if (process.env.NODE_ENV === "production" && !webhookUrl.startsWith("https://")) {
    throw new Error("OPERATIONS_ALERT_WEBHOOK_URL must use HTTPS in production");
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildOperationalAlertPayload(event)),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Alert webhook returned HTTP ${response.status}`);
  return { status: "sent", httpStatus: response.status };
};

export const notifyOperationalEvent = async (event) => {
  const alertConfig = config();
  if (!event?._id || !alertConfig.webhookUrl || !ALERTABLE_TYPES.has(event.event_type)) {
    return { status: "not_applicable" };
  }
  const threshold = event.event_type === "transaction_aborted"
    ? alertConfig.transactionAbortThreshold
    : 1;
  if (event.occurrences < threshold) return { status: "below_threshold" };

  const now = new Date();
  const claimed = await OperationalEvent.findOneAndUpdate(
    {
      _id: event._id,
      status: "open",
      occurrences: { $gte: threshold },
      $or: [
        { alert_next_eligible_at: null },
        { alert_next_eligible_at: { $lte: now } },
      ],
    },
    {
      $set: {
        alert_next_eligible_at: new Date(now.getTime() + alertConfig.cooldownSeconds * 1000),
      },
    },
    { new: true },
  );
  if (!claimed) return { status: "deduplicated" };

  try {
    const result = await deliverOperationalAlert(claimed);
    await OperationalEvent.updateOne({ _id: claimed._id }, {
      $set: { alert_last_sent_at: new Date(), alert_last_status: "sent", alert_last_error: null },
      $inc: { alert_delivery_count: 1 },
    });
    return result;
  } catch (error) {
    await OperationalEvent.updateOne({ _id: claimed._id }, {
      $set: {
        alert_last_status: "failed",
        alert_last_error: String(error?.message || error).slice(0, 500),
        alert_next_eligible_at: new Date(Date.now() + 60_000),
      },
    });
    return { status: "failed", error: error?.message || String(error) };
  }
};
