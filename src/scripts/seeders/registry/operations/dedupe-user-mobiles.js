import { runDedupeUserMobiles } from "../../../dedupeUserMobiles.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runDedupeUserMobiles({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "dedupe-user-mobiles",
  name: "Dedupe User Mobiles",
  description: "Soft-tags newer duplicate (phone_code, mobile) user accounts (keeps the oldest as canonical) so the unique partial index can build. Reversible.",
  type: "REPAIR",
  category: "users",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets deleted_at and suffixes `mobile` on every duplicate account after the first per (phone_code, mobile) group. No document is deleted; reversible.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
