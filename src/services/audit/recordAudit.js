import AuditLog from "../../models/AuditLog.js";

/**
 * recordAudit({ userId, event, req })
 * Fire-and-forget-safe: caller should still await it (so it's part of the
 * request lifecycle for tests), but a logging failure must never fail the
 * actual profile change it's recording.
 */
export const recordAudit = async ({ userId, event, req }) => {
  try {
    await AuditLog.create({
      user_id: userId,
      event,
      ip: req?.ip || null,
      user_agent: req?.headers?.["user-agent"] || null,
    });
  } catch (error) {
    console.error("recordAudit error:", error.message);
  }
};
