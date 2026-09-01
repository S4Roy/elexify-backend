import { runFixProductContent } from "../../../fixProductContent.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

// Reuses the script's own --dry-run flag logic directly (apply=false) —
// see plan §15: repair scripts that already have a dry-run/apply flag get
// their existing logic reused, not reimplemented.
const handler = async (context) => {
  const { result, dryRunPreview } = await runFixProductContent({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "fix-product-content",
  name: "Fix Product Content",
  description: "Cleans authoring-tool artifacts from product description/short_description HTML and regenerates SEO meta descriptions for the full catalog.",
  type: "REPAIR",
  category: "catalog",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "May modify description/short_description on any product with authoring artifacts, and regenerates every product's SEO meta description (skips manually-edited ones).",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
