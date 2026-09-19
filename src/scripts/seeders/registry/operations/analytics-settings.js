import SiteSetting from "../../../../models/SiteSetting.js";
import { runSeedAnalyticsSettings } from "../../../seedAnalyticsSettings.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const SLUGS = ["gtm_container_id"];

const handler = async (context) => {
  if (context.dryRun) {
    const existing = await SiteSetting.find({ slug: { $in: SLUGS } }).select("slug").lean();
    const missing = SLUGS.filter((slug) => !existing.some((s) => s.slug === slug));
    context.logger.info(`Dry run: ${missing.length} of ${SLUGS.length} analytics setting(s) missing and would be created.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: SLUGS.length - missing.length, wouldDelete: 0 };
  }

  const { result } = await runSeedAnalyticsSettings({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const actual = await SiteSetting.countDocuments({ slug: { $in: SLUGS } });
  return {
    status: actual >= SLUGS.length ? "HEALTHY" : "DEGRADED",
    expected: SLUGS.length,
    actual,
    detail: `${actual}/${SLUGS.length} analytics setting(s) present.`,
  };
};

export default {
  key: "analytics-settings",
  name: "Seed Analytics Settings",
  description: "Seeds gtm_container_id (blank by default) so an admin can wire up Google Tag Manager / GA4 from the Settings page without a code change. Uses $setOnInsert so it never overwrites a value an admin has since edited.",
  type: "SEEDER",
  category: "settings",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Upserts up to ${SLUGS.length} SiteSetting row(s) via $setOnInsert only.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
