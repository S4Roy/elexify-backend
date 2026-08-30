import ProviderOrderAttempt from "../../models/ProviderOrderAttempt.js";
import { findRazorpayOrderByReceipt } from "./createRazorpayOrder.js";
import { recordOperationalEvent } from "../observability/recordOperationalEvent.js";

const RETRY_DELAY_MS = 60_000;

export const reconcileProviderOrderAttempt = async (attemptId) => {
  const attempt = await ProviderOrderAttempt.findOneAndUpdate(
    {
      _id: attemptId,
      provider_order_id: null,
      status: { $in: ["creating", "orphaned", "failed"] },
    },
    {
      $set: { status: "reconciling", updated_at: new Date(), last_error: null },
      $inc: { reconciliation_attempts: 1 },
    },
    { new: true },
  );
  if (!attempt) return ProviderOrderAttempt.findById(attemptId);

  try {
    const providerOrder = await findRazorpayOrderByReceipt({
      receipt: attempt.local_order_id, amount: attempt.amount, currency: attempt.currency,
    });
    if (!providerOrder) {
      await ProviderOrderAttempt.updateOne({ _id: attempt._id }, { $set: {
        status: "failed",
        last_error: "No provider order found by deterministic receipt; retry reconciliation before creating another order",
        next_reconciliation_at: new Date(Date.now() + RETRY_DELAY_MS),
        updated_at: new Date(),
      } });
      await recordOperationalEvent({
        eventType: "provider_reconciliation_failed", correlationId: attempt.local_order_id,
        summary: "Razorpay order was not found for an incomplete provider attempt",
        metadata: { attempt_id: attempt._id, provider: attempt.provider },
      }).catch(() => undefined);
      return ProviderOrderAttempt.findById(attempt._id);
    }
    return ProviderOrderAttempt.findOneAndUpdate(
      { _id: attempt._id, provider_order_id: null },
      { $set: {
        provider_order_id: providerOrder.id, status: "reconciled", reconciled_at: new Date(),
        next_reconciliation_at: null, last_error: null, updated_at: new Date(),
      } },
      { new: true },
    );
  } catch (error) {
    await ProviderOrderAttempt.updateOne({ _id: attempt._id }, { $set: {
      status: "failed", last_error: String(error?.message || error).slice(0, 1000),
      next_reconciliation_at: new Date(Date.now() + RETRY_DELAY_MS), updated_at: new Date(),
    } });
    await recordOperationalEvent({
      eventType: "provider_reconciliation_failed", correlationId: attempt.local_order_id,
      summary: "Provider-order reconciliation failed",
      metadata: { attempt_id: attempt._id, provider: attempt.provider, reason: error?.message },
    }).catch(() => undefined);
    throw error;
  }
};

