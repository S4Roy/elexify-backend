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
import mongoose from "../config/mongoose.js";
import Cart from "../models/Cart.js";

const STALE_INDEXES = ["user_1_product_1", "guest_id_1_product_1"];

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const carts = mongoose.connection.collection("carts");
  const existing = await carts.indexes();
  const names = existing.map((i) => i.name);

  for (const indexName of STALE_INDEXES) {
    if (names.includes(indexName)) {
      await carts.dropIndex(indexName);
      console.log(`Dropped stale index: ${indexName}`);
    } else {
      console.log(`Index not present (already clean): ${indexName}`);
    }
  }

  await Cart.syncIndexes();
  console.log("Synced Cart indexes with current schema.");

  const finalIndexes = await carts.indexes();
  console.log("Final carts indexes:", JSON.stringify(finalIndexes, null, 2));

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
