import SiteSetting from "../../../../models/SiteSetting.js";
import { runSeedContactSettings } from "../../../seedContactSettings.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const SLUGS = ["contact_mobile", "contact_email", "contact_address", "business_hours"];

const handler = async (context) => {
  if (context.dryRun) {
    const existing = await SiteSetting.find({ slug: { $in: SLUGS } }).select("slug").lean();
    const missing = SLUGS.filter((slug) => !existing.some((s) => s.slug === slug));
    context.logger.info(`Dry run: ${missing.length} of ${SLUGS.length} contact setting(s) missing and would be created.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: SLUGS.length - missing.length, wouldDelete: 0 };
  }

  const { result } = await runSeedContactSettings({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const actual = await SiteSetting.countDocuments({ slug: { $in: SLUGS } });
  return {
    status: actual >= SLUGS.length ? "HEALTHY" : "DEGRADED",
    expected: SLUGS.length,
    actual,
    detail: `${actual}/${SLUGS.length} contact setting(s) present.`,
  };
};

export default {
  key: "contact-settings",
  name: "Seed Contact Settings",
  description: "Seeds contact_mobile/contact_email/contact_address/business_hours so the Contact Us page shows real details. Uses $setOnInsert (fixed from the original non-idempotent $set) so it never overwrites an admin-edited value.",
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
