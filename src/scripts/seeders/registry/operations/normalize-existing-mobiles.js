import { runNormalizeExistingMobiles } from "../../../normalizeExistingMobiles.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runNormalizeExistingMobiles({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "normalize-existing-mobiles",
  name: "Normalize Existing Mobiles",
  description: "Strips '+'/country-code prefixes and whitespace from stored mobile values so the same number can't exist in multiple string forms. Run before dedupe-user-mobiles.",
  type: "REPAIR",
  category: "users",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Rewrites the `mobile` field on any user whose value isn't already in normalized form. Values that can't be normalized are left untouched and flagged for manual review.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
