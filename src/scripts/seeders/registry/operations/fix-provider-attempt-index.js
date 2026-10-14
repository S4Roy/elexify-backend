// Replaces ProviderOrderAttempt's unique *sparse* provider_order_id index with
// a partial one. Sparse still indexes the explicit `null` default, so two
// customers whose prepaid checkouts were both awaiting the Razorpay create
// call collided on it and one got a 500. The new index is built first (under
// its own name) so uniqueness on real provider ids is never unguarded.
import ProviderOrderAttempt from "../../../../models/ProviderOrderAttempt.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const NEW_NAME = "provider_order_id_unique";
const NEW_OPTIONS = { unique: true, name: NEW_NAME, partialFilterExpression: { provider_order_id: { $type: "string" } } };

const staleIndexes = async () => (await ProviderOrderAttempt.collection.indexes())
  .filter((index) => index.key?.provider_order_id === 1 && Object.keys(index.key).length === 1 && index.name !== NEW_NAME);

const handler = async (context) => {
  const stale = await staleIndexes();
  const hasNew = (await ProviderOrderAttempt.collection.indexes()).some((index) => index.name === NEW_NAME);
  if (context.dryRun) {
    context.logger.info(`Dry run: ${hasNew ? "partial index already present" : "would create partial index"}, ${stale.length} stale index(es) to drop.`);
    return { wouldInsert: hasNew ? 0 : 1, wouldUpdate: 0, wouldSkip: 0, wouldDelete: stale.length };
  }

  let created = 0;
  if (!hasNew) {
    try {
      await ProviderOrderAttempt.collection.createIndex({ provider_order_id: 1 }, NEW_OPTIONS);
    } catch (error) {
      // Older servers refuse two indexes on the same key; swap instead.
      context.logger.info(`Side-by-side build refused (${error.message}); dropping the old index first.`);
      for (const index of stale) await ProviderOrderAttempt.collection.dropIndex(index.name);
      stale.length = 0;
      await ProviderOrderAttempt.collection.createIndex({ provider_order_id: 1 }, NEW_OPTIONS);
    }
    created = 1;
  }
  for (const index of stale) await ProviderOrderAttempt.collection.dropIndex(index.name);
  context.logger.info(`Partial provider_order_id index ${created ? "created" : "already present"}; dropped ${stale.length} stale index(es).`);
  return { inserted: created, updated: 0, skipped: 0, deleted: stale.length, warnings: [] };
};

export default {
  key: "fix-provider-attempt-index",
  name: "Fix Provider Attempt Index",
  description: "Replaces the sparse unique provider_order_id index (which collided on null between concurrent prepaid checkouts) with a partial unique index.",
  type: "REPAIR",
  category: "database",
  version: 1,
  required: true,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Creates one index and drops one index on provider_order_attempts. No documents change.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
