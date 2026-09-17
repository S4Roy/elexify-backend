import { runDedupeUserMobiles } from "../../../dedupeUserMobiles.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runDedupeUserMobiles({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "dedupe-user-mobiles",
  name: "Dedupe User Mobiles",
  description: "Matches duplicate user accounts on normalized (phone_code, mobile), canonicalizes the oldest as survivor, and soft-tags the rest so the unique partial index can build. Reversible.",
  type: "REPAIR",
  category: "users",
  version: 2,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  // Deliberately NOT a hard dependency on normalize-existing-mobiles: this
  // operation now matches on the normalized value itself (see
  // dedupeUserMobiles.js), so it's correct standalone. A hard dependency
  // here would also block a harmless dry-run preview (runner.js checks
  // dependencies before the dry-run branch) until normalize had a real
  // apply run, which isn't actually required anymore. Running normalize
  // first is still recommended (fewer accounts end up tagged vs. already
  // clean) — see the description below.
  dependencies: [],
  estimatedImpact: "Sets deleted_at and suffixes `mobile` on every duplicate account after the first per normalized (phone_code, mobile) group; rewrites the survivor's mobile/phone_code to canonical form if needed. No document is deleted; reversible.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
