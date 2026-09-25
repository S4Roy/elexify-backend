// Payment capture used to move a prepaid order straight to "processing"
// (finalizeCapturedPayment.js). It now lands on "confirmed", with
// "processing" reserved for an admin actually starting to prepare the order.
// This moves orders that were auto-set to "processing" — never touched by an
// admin, not yet packed — back to "confirmed", and stamps confirmed_at on
// every order that has left "pending" without one.
import Order from "../../../../models/Order.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

// Auto-processing orders: no admin ever set "processing" and nothing has
// been packed, so the status only ever meant "payment received".
const AUTO_PROCESSING_FILTER = {
  deleted_at: null,
  order_status: "processing",
  processing_at: null,
  "manual_status_history.to": { $ne: "processing" },
  package_count: { $in: [0, null] },
};

const MISSING_CONFIRMED_AT_FILTER = {
  deleted_at: null,
  confirmed_at: null,
  order_status: { $nin: ["pending", "failed"] },
};

const handler = async (context) => {
  const [autoProcessing, missingConfirmedAt] = await Promise.all([
    Order.countDocuments(AUTO_PROCESSING_FILTER),
    Order.countDocuments(MISSING_CONFIRMED_AT_FILTER),
  ]);

  if (context.dryRun) {
    context.logger.info(`Dry run: ${autoProcessing} auto-processing order(s) would move to "confirmed"; ${missingConfirmedAt} order(s) would get confirmed_at.`);
    return { wouldInsert: 0, wouldUpdate: autoProcessing + missingConfirmedAt, wouldSkip: 0, wouldDelete: 0 };
  }

  const statusResult = await Order.updateMany(AUTO_PROCESSING_FILTER, [
    { $set: { order_status: "confirmed", confirmed_at: { $ifNull: ["$confirmed_at", "$paid_at", "$created_at"] } } },
  ]);
  const stampResult = await Order.updateMany(MISSING_CONFIRMED_AT_FILTER, [
    { $set: { confirmed_at: { $ifNull: ["$processing_at", "$paid_at", "$created_at"] } } },
  ]);
  const moved = statusResult.modifiedCount ?? 0;
  const stamped = stampResult.modifiedCount ?? 0;
  context.logger.info(`Moved ${moved} order(s) from "processing" to "confirmed"; stamped confirmed_at on ${stamped} more.`);
  return { inserted: 0, updated: moved + stamped, skipped: 0, deleted: 0, warnings: [] };
};

export default {
  key: "order-confirmed-status-backfill",
  name: "Backfill Confirmed Order Status",
  description: "Moves orders auto-set to \"processing\" on payment capture (never touched by an admin, not packed) to \"confirmed\", and stamps confirmed_at on orders past pending.",
  type: "BACKFILL",
  category: "commerce",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Updates order_status (processing → confirmed) on untouched, unpacked orders and sets confirmed_at where missing; no other fields, no notifications.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
