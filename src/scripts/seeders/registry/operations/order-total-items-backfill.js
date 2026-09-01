// Absorbs the Order.total_items backfill half of the legacy, UNAUTHENTICATED
// `GET ${basePath}/debug/db-seeding` route (controllers/DbSeedingController.js,
// removed from server.js as part of this migration). Same two-query +
// bulkWrite shape as the original (avoids one OrderItem.find + one
// Order.updateOne per order, which routinely timed out on 10k+ orders) —
// only the trigger surface changed (registry + RBAC + audit instead of an
// open GET route), not the algorithm.
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const computeCounts = async () => {
  const allOrderIds = await Order.find({}).distinct("_id");
  const itemCounts = await OrderItem.aggregate([{ $group: { _id: "$order_id", count: { $sum: 1 } } }]);
  const countByOrderId = new Map(itemCounts.map(({ _id, count }) => [String(_id), count]));
  return { allOrderIds, countByOrderId };
};

const handler = async (context) => {
  const { allOrderIds, countByOrderId } = await computeCounts();

  if (context.dryRun) {
    const orders = await Order.find({ _id: { $in: allOrderIds } }).select("_id total_items").lean();
    const wouldUpdate = orders.filter((o) => (o.total_items ?? 0) !== (countByOrderId.get(String(o._id)) ?? 0)).length;
    context.logger.info(`Dry run: ${wouldUpdate} of ${orders.length} order(s) have a stale total_items value and would be corrected.`);
    return { wouldInsert: 0, wouldUpdate, wouldSkip: orders.length - wouldUpdate, wouldDelete: 0 };
  }

  if (!allOrderIds.length) {
    context.logger.info("No orders found — nothing to backfill.");
    return { inserted: 0, updated: 0, skipped: 0, deleted: 0, warnings: [] };
  }

  const result = await Order.bulkWrite(
    allOrderIds.map((_id) => ({
      updateOne: {
        filter: { _id },
        update: { total_items: countByOrderId.get(String(_id)) ?? 0 },
      },
    })),
  );
  const updated = result.modifiedCount ?? 0;
  context.logger.info(`Backfilled total_items on ${allOrderIds.length} order(s), ${updated} value(s) actually changed.`);
  return { inserted: 0, updated, skipped: allOrderIds.length - updated, deleted: 0, warnings: [] };
};

export default {
  key: "order-total-items-backfill",
  name: "Backfill Order Total Items",
  description: "Recomputes Order.total_items from OrderItem counts for every order. Absorbed from the legacy unauthenticated /debug/db-seeding route.",
  type: "BACKFILL",
  category: "commerce",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Recomputes and overwrites Order.total_items on every order document via one bulkWrite; does not touch any other field.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
