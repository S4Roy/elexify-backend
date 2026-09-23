import { runBackfillVerifiedEmailForAdminStaff } from "../../../backfillVerifiedEmailForAdminStaff.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runBackfillVerifiedEmailForAdminStaff({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "backfill-verified-email-admin-staff",
  name: "Backfill Verified Email (Admin/Staff)",
  description: "Sets email_verified_at on existing admin/staff accounts (admin_role_id set) that predate this field, so security emails (password change, reset, account lockout) stop being silently dropped for them.",
  type: "BACKFILL",
  category: "users",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets email_verified_at (to now) on every admin/staff account (admin_role_id set) with email_verified_at: null. No other field is touched.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
