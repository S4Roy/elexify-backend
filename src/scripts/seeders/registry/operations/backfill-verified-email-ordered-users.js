import { runBackfillVerifiedEmailForOrderedUsers } from "../../../backfillVerifiedEmailForOrderedUsers.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runBackfillVerifiedEmailForOrderedUsers({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "backfill-verified-email-ordered-users",
  name: "Backfill Verified Email (Ordered Users)",
  description: "Sets email_verified_at on existing active users who never went through OTP but have at least one real order on record, using their earliest order's date as the verified timestamp.",
  type: "BACKFILL",
  category: "users",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets email_verified_at (to their earliest order's created_at) on every active user with email_verified_at: null who has placed at least one order. No other field is touched; users with no order history are left untouched.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
