import { runFixWishlistIndexes } from "../../../fixWishlistIndexes.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result } = await runFixWishlistIndexes({ logger: context.logger });
  return result;
};

export default {
  key: "fix-wishlist-indexes",
  name: "Fix Wishlist Indexes",
  description: "Drops two stale pre-variation wishlist indexes and re-syncs Wishlist's indexes with the current schema.",
  type: "REPAIR",
  category: "database",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Drops up to 2 stale indexes on the wishlists collection, then syncs indexes to match Wishlist.js.",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
