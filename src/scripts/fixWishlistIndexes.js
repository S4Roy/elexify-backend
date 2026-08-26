/**
 * Drops two stale indexes on the `wishlists` collection left over from before
 * `variation` was added to Wishlist's compound unique key:
 *   - user_1_product_1       (no `variation`; partialFilterExpression without
 *     `$ne: null` also matches `user: null` guest wishlist entries, since a
 *     null field still "exists" — wrongly enforcing "one wishlist entry per
 *     product across ALL guests, ever".)
 *   - guest_id_1_product_1   (no `variation`; same problem in reverse — every
 *     logged-in user has `guest_id: null`, so this index wrongly enforced
 *     "one wishlist entry per product across ALL logged-in users, ever",
 *     causing E11000 duplicate-key errors whenever a second user wishlisted
 *     a product someone else already had wishlisted.)
 *
 * The correct replacements (`user_1_product_1_variation_1`,
 * `guest_id_1_product_1_variation_1`, matching the current Wishlist.js
 * schema, with `$ne: null` partial filters) already exist on the collection
 * — this script only removes the stale ones and lets Wishlist.syncIndexes()
 * confirm the rest match the schema.
 *
 * Usage:
 *   node src/scripts/fixWishlistIndexes.js
 */
import mongoose from "../config/mongoose.js";
import Wishlist from "../models/Wishlist.js";

const STALE_INDEXES = ["user_1_product_1", "guest_id_1_product_1"];

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const wishlists = mongoose.connection.collection("wishlists");
  const existing = await wishlists.indexes();
  const names = existing.map((i) => i.name);

  for (const indexName of STALE_INDEXES) {
    if (names.includes(indexName)) {
      await wishlists.dropIndex(indexName);
      console.log(`Dropped stale index: ${indexName}`);
    } else {
      console.log(`Index not present (already clean): ${indexName}`);
    }
  }

  await Wishlist.syncIndexes();
  console.log("Synced Wishlist indexes with current schema.");

  const finalIndexes = await wishlists.indexes();
  console.log("Final wishlists indexes:", JSON.stringify(finalIndexes, null, 2));

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
