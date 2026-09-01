import Country from "../../../../models/Country.js";
import { runRestrictCountriesToIndia } from "../../../restrictCountriesToIndia.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const INDIA_ID = 101;

const handler = async (context) => {
  if (context.dryRun) {
    const wouldUpdate = await Country.countDocuments({ id: { $ne: INDIA_ID }, status: { $ne: "inactive" } });
    context.logger.info(`Dry run: would deactivate ${wouldUpdate} non-India countr${wouldUpdate === 1 ? "y" : "ies"}.`);
    return { wouldInsert: 0, wouldUpdate, wouldSkip: 0, wouldDelete: 0 };
  }

  const { result } = await runRestrictCountriesToIndia({ logger: context.logger });
  return result;
};

export default {
  key: "restrict-countries",
  name: "Restrict Countries to India",
  description: "Sets every Country except India to inactive so checkout only serves India. Re-enabling others is a manual admin action afterward — running this again is a no-op once already applied.",
  type: "MIGRATION",
  category: "commerce",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets status=inactive on every non-India Country document; reversible via Settings > Countries.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
