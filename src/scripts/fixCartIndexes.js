/**
 * Drops two stale indexes on the `carts` collection left over from before
 * `variation` was added to Cart's compound unique key:
 *   - user_1_product_1       (no `variation`; partialFilterExpression
 *     `{ user: { $exists: true } }` also matches `user: null` guest carts,
 *     since a null field still "exists" — so it was wrongly enforcing
 *     "one cart line per product across ALL guests, ever", causing
 *     E11000 duplicate-key errors whenever a second guest added a product
 *     someone else's guest cart already contained.)
 *   - guest_id_1_product_1   (no `variation`; would similarly collide
 *     across two variations of the same product for one guest.)
 *
 * The correct replacements (`user_1_product_1_variation_1`,
 * `guest_id_1_product_1_variation_1`, matching the current Cart.js schema)
 * already exist on the collection — this script only removes the stale
 * ones and lets Cart.syncIndexes() confirm the rest match the schema.
 *
 * Usage:
 *   node src/scripts/fixCartIndexes.js
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Cart from "../models/Cart.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

const STALE_INDEXES = ["user_1_product_1", "guest_id_1_product_1"];

export const runFixCartIndexes = async ({ logger = createLogger() } = {}) => {
  const carts = mongoose.connection.collection("carts");
  const existing = await carts.indexes();
  const names = existing.map((i) => i.name);

  let dropped = 0;
  for (const indexName of STALE_INDEXES) {
    if (names.includes(indexName)) {
      await carts.dropIndex(indexName);
      dropped += 1;
      logger.info(`Dropped stale index: ${indexName}`);
    } else {
      logger.info(`Index not present (already clean): ${indexName}`);
    }
  }

  await Cart.syncIndexes();
  logger.info("Synced Cart indexes with current schema.");

  const finalIndexes = await carts.indexes();
  logger.info(`Final carts indexes: ${finalIndexes.map((i) => i.name).join(", ")}`);

  return { logs: logger.logs, summary: { dropped }, result: buildResult({ deleted: dropped }) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runFixCartIndexes();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
