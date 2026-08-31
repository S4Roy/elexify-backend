import AuditLog from "../../models/AuditLog.js";

/**
 * recordAudit({ userId, event, req, actorId, reason, metadata })
 * Fire-and-forget-safe: caller should still await it (so it's part of the
 * request lifecycle for tests), but a logging failure must never fail the
 * actual profile change it's recording.
 *
 * `actorId`/`reason`/`metadata` are only set for admin-initiated events
 * (verification override, manual notification retry, admin preference
 * change) — omit them for customer-initiated events, exactly as Phase 1's
 * call sites already do.
 */
export const recordAudit = async ({ userId, event, req, actorId = null, reason = null, metadata = null }) => {
  try {
    await AuditLog.create({
      user_id: userId,
      event,
      actor_id: actorId,
      reason,
      metadata,
      ip: req?.ip || null,
      user_agent: req?.headers?.["user-agent"] || null,
    });
  } catch (error) {
    console.error("recordAudit error:", error.message);
  }
};
