import Page from "../../../../models/Page.js";
import { runSeedCmsPages } from "../../../seedCmsPages.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const REQUIRED_SLUGS = ["about-us", "contact-us", "faq", "refund-policy", "terms-and-conditions"];

const handler = async (context) => {
  if (context.dryRun) {
    const existing = await Page.find({ slug: { $in: REQUIRED_SLUGS } }).select("slug").lean();
    const missing = REQUIRED_SLUGS.filter((slug) => !existing.some((p) => p.slug === slug));
    context.logger.info(`Dry run: ${missing.length} of ${REQUIRED_SLUGS.length} CMS page(s) missing and would be created: ${missing.join(", ") || "none"}.`);
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: REQUIRED_SLUGS.length - missing.length, wouldDelete: 0 };
  }

  const { logs, result } = await runSeedCmsPages({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const actual = await Page.countDocuments({ slug: { $in: REQUIRED_SLUGS } });
  return {
    status: actual >= REQUIRED_SLUGS.length ? "HEALTHY" : "DEGRADED",
    expected: REQUIRED_SLUGS.length,
    actual,
    detail: `${actual}/${REQUIRED_SLUGS.length} required CMS page(s) present.`,
  };
};

export default {
  key: "cms-pages",
  name: "Seed CMS Pages",
  description: "Creates the required static CMS pages (about-us, contact-us, faq, refund-policy, terms-and-conditions) if missing.",
  type: "SEEDER",
  category: "content",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Creates up to ${REQUIRED_SLUGS.length} Page document(s); never overwrites an existing page.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
