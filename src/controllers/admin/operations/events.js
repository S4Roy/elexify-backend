import OperationalEvent from "../../../models/OperationalEvent.js";
import WebhookEvent from "../../../models/WebhookEvent.js";
import ProviderOrderAttempt from "../../../models/ProviderOrderAttempt.js";
import { StatusError } from "../../../config/index.js";

export const listOperationalEvents = async (req, res, next) => {
  try {
    const status = ["open", "acknowledged", "resolved"].includes(req.query.status) ? req.query.status : "open";
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [events, deadLetters, providerQueue] = await Promise.all([
      OperationalEvent.find({ status }).sort({ severity: 1, last_seen_at: -1 }).limit(limit).lean(),
      WebhookEvent.find({ status: "dead_letter" }).sort({ received_at: -1 }).limit(limit).select("event_id event_type attempts last_error received_at").lean(),
      ProviderOrderAttempt.find({ status: { $in: ["orphaned", "failed", "reconciling"] } })
        .sort({ updated_at: 1 }).limit(limit)
        .select("local_order_id provider_order_id status reconciliation_attempts last_error next_reconciliation_at updated_at").lean(),
    ]);
    return res.status(200).json({ status: "success", data: { events, dead_letters: deadLetters, provider_queue: providerQueue } });
  } catch (error) { next(error); }
};

export const updateOperationalEvent = async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!["acknowledged", "resolved"].includes(status)) throw StatusError.badRequest("Invalid operations status");
    const event = await OperationalEvent.findByIdAndUpdate(req.params.id, {
      $set: { status, resolved_at: status === "resolved" ? new Date() : null },
    }, { new: true });
    if (!event) throw StatusError.notFound("Operational event not found");
    return res.status(200).json({ status: "success", data: event });
  } catch (error) { next(error); }
};

