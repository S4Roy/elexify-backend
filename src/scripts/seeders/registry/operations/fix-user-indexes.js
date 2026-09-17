import { runFixUserIndexes } from "../../../fixUserIndexes.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result } = await runFixUserIndexes({ logger: context.logger });
  return result;
};

export default {
  key: "fix-user-indexes",
  name: "Fix User Indexes",
  description: "Drops stale email_1 / phone_code_1_mobile_1 user indexes and re-syncs User's partial indexes.",
  type: "REPAIR",
  category: "database",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  // syncIndexes() builds the unique (phone_code, mobile) partial index —
  // that build fails with a duplicate-key error if real duplicate accounts
  // still exist, so dedupe-user-mobiles must have run successfully first.
  dependencies: ["dedupe-user-mobiles"],
  estimatedImpact: "Drops up to 2 stale indexes on the users collection, then syncs indexes to match User.js.",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
