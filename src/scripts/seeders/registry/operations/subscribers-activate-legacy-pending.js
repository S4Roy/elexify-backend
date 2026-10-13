// Newsletter signups made before the campaigns feature were stored as
// "pending" — the old Subscriber schema's default, a leftover "awaiting
// review" status copied from enquiries — not because consent was missing:
// every one of them submitted the newsletter form themselves. Campaigns only
// send to "subscribed", so this moves those legacy rows over. Never touches
// contacts that unsubscribed, were suppressed, deleted, or have any other
// status.
import Subscriber from "../../../../models/Subscriber.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const FILTER = { status: "pending", deleted_at: null, unsubscribed_at: null };

const handler = async (context) => {
  const total = await Subscriber.countDocuments(FILTER);
  if (context.dryRun) {
    const bySource = await Subscriber.aggregate([{ $match: FILTER }, { $group: { _id: "$source", count: { $sum: 1 } } }]);
    context.logger.info(`Dry run: ${total} pending subscriber(s) would become subscribed (${bySource.map((s) => `${s._id || "unknown"}: ${s.count}`).join(", ") || "none"}).`);
    return { wouldInsert: 0, wouldUpdate: total, wouldSkip: 0, wouldDelete: 0 };
  }
  const result = await Subscriber.updateMany(FILTER, { $set: { status: "subscribed", updated_at: new Date() } }, { timestamps: false });
  const updated = result.modifiedCount ?? 0;
  context.logger.info(`Marked ${updated} legacy pending subscriber(s) as subscribed.`);
  return { inserted: 0, updated, skipped: Math.max(total - updated, 0), deleted: 0, warnings: [] };
};

export default {
  key: "subscribers-activate-legacy-pending",
  name: "Activate Legacy Pending Subscribers",
  description: "Moves newsletter signups stored as \"pending\" (the old default status) to \"subscribed\" so campaigns can reach them. Unsubscribed, suppressed and deleted contacts are never touched.",
  type: "BACKFILL",
  category: "notifications",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Updates Subscriber.status from pending to subscribed for every non-deleted, never-unsubscribed pending contact; no other field or status changes.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
  healthCheck: async () => {
    const pending = await Subscriber.countDocuments(FILTER);
    return { status: pending ? "DEGRADED" : "HEALTHY", actual: pending, expected: 0, detail: `${pending} legacy pending subscriber(s) remaining.` };
  },
};
