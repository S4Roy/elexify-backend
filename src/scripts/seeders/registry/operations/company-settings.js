import SiteSetting from "../../../../models/SiteSetting.js";
import { runSeedCompanySettings } from "../../../seedCompanySettings.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const SLUGS = ["company_name", "company_address", "company_state", "company_gstin", "company_email", "company_phone", "company_gst_rate"];

const handler = async (context) => {
  if (context.dryRun) {
    const existing = await SiteSetting.find({ slug: { $in: SLUGS } }).select("slug").lean();
    const missing = SLUGS.filter((slug) => !existing.some((s) => s.slug === slug));
    context.logger.info(`Dry run: ${missing.length} of ${SLUGS.length} company setting(s) missing and would be created.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: SLUGS.length - missing.length, wouldDelete: 0 };
  }

  const { result } = await runSeedCompanySettings({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const actual = await SiteSetting.countDocuments({ slug: { $in: SLUGS } });
  return {
    status: actual >= SLUGS.length ? "HEALTHY" : "DEGRADED",
    expected: SLUGS.length,
    actual,
    detail: `${actual}/${SLUGS.length} company/GST setting(s) present.`,
  };
};

export default {
  key: "company-settings",
  name: "Seed Company Settings",
  description: "Seeds the company/GST settings used on generated tax invoices. Never overwrites a value an admin has since edited.",
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
