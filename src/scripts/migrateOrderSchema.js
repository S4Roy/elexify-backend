import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Order from "../models/Order.js";
import { collectOrderMigrationPreflight } from "./preflightOrderMigration.js";
import CouponUsage from "../models/CouponUsage.js";
import StockTransaction from "../models/StockTransaction.js";
import ProviderOrderAttempt from "../models/ProviderOrderAttempt.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

// CRITICAL, non-idempotent financial-schema migration. Deliberately kept
// behind TWO independent gates, not just the data-operations runner's
// admin-side typed confirmation:
//   1. MIGRATION_CONFIRMED=yes must be set in the server's own environment
//      — an operator decision made out-of-band from any HTTP request,
//      confirming a backup + staging preflight were already done.
//   2. The registry (runner.js) additionally requires the typed
//      "RUN PRODUCTION" confirmation string in the admin request body for
//      HIGH/CRITICAL-risk operations, and blocks re-running this specific
//      key entirely once a prior SUCCESS execution exists for the current
//      environment (idempotent: false in the registry entry).
// This is intentionally NOT something the admin panel alone can trigger in
// production without an operator first setting the env var on the server.
export const runMigrateOrderSchema = async ({ logger = createLogger() } = {}) => {
  if (process.env.MIGRATION_CONFIRMED !== "yes") {
    throw new Error("Refusing migration without MIGRATION_CONFIRMED=yes after backup and staging preflight");
  }
  logger.info("MIGRATION_CONFIRMED=yes — proceeding.");

  const preflight = await collectOrderMigrationPreflight();
  if (!preflight.safe_to_migrate) {
    logger.error(`Preflight failed: ${JSON.stringify(preflight.conflicts)}`);
    throw new Error(JSON.stringify(preflight, null, 2));
  }
  logger.info("Preflight passed — no financial conflicts found.");

  const result = await Order.collection.updateMany(
    { exchnage_rate: { $exists: true }, exchange_rate: { $exists: false } },
    [{ $set: { exchange_rate: "$exchnage_rate" } }, { $unset: "exchnage_rate" }],
  );
  const migratedCount = result.nModified ?? result.modifiedCount ?? 0;
  logger.info(`Migrated exchange_rate on ${migratedCount} order(s)`);

  await Promise.all([
    Order.syncIndexes(), CouponUsage.syncIndexes(),
    StockTransaction.syncIndexes(), ProviderOrderAttempt.syncIndexes(),
  ]);
  logger.info("Synced indexes on Order, CouponUsage, StockTransaction, ProviderOrderAttempt.");

  const [orderIndexes, couponIndexes, ledgerIndexes, providerIndexes] = await Promise.all([
    Order.collection.indexes(), CouponUsage.collection.indexes(), StockTransaction.collection.indexes(),
    ProviderOrderAttempt.collection.indexes(),
  ]);
  if (
    !orderIndexes.some((index) => index.key?.id === 1 && index.unique) ||
    !orderIndexes.some((index) => index.key?.user === 1 && index.key?.idempotency_key === 1 && index.unique) ||
    !couponIndexes.some((index) => index.key?.order === 1 && index.unique) ||
    !ledgerIndexes.some((index) => index.unique && index.key?.reference_id === 1 && index.key?.product === 1) ||
    !providerIndexes.some((index) => index.key?.user === 1 && index.key?.idempotency_key === 1 && index.unique) ||
    !providerIndexes.some((index) => index.key?.provider_order_id === 1 && index.unique)
  ) {
    logger.error("Required financial uniqueness index verification failed");
    throw new Error("Required financial uniqueness index verification failed");
  }
  logger.info("Required financial uniqueness indexes verified.");

  return {
    logs: logger.logs,
    summary: { migratedExchangeRate: migratedCount },
    result: buildResult({ updated: migratedCount }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runMigrateOrderSchema();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
  };
  run().catch(async (error) => {
    console.error(error?.message || error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
