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
  dependencies: [],
  estimatedImpact: "Drops up to 2 stale indexes on the users collection, then syncs indexes to match User.js.",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
