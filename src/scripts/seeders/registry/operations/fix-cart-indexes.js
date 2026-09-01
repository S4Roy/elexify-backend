import { runFixCartIndexes } from "../../../fixCartIndexes.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result } = await runFixCartIndexes({ logger: context.logger });
  return result;
};

export default {
  key: "fix-cart-indexes",
  name: "Fix Cart Indexes",
  description: "Drops two stale pre-variation cart indexes and re-syncs Cart's indexes with the current schema.",
  type: "REPAIR",
  category: "database",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Drops up to 2 stale indexes on the carts collection, then syncs indexes to match Cart.js.",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
