import FAQ from "../../../../models/FAQ.js";
import { runSeedFaqs, FAQ_SEED_COUNT } from "../../../seedFaqs.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const existing = await FAQ.countDocuments({ deleted_at: null });
    const wouldInsert = existing > 0 ? 0 : FAQ_SEED_COUNT;
    context.logger.info(existing > 0 ? "Dry run: FAQs already seeded — nothing would change." : `Dry run: would seed ${wouldInsert} default FAQ item(s).`);
    return { wouldInsert, wouldUpdate: 0, wouldSkip: existing > 0 ? 1 : 0, wouldDelete: 0 };
  }

  const { result } = await runSeedFaqs({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const actual = await FAQ.countDocuments({ deleted_at: null });
  return {
    status: actual > 0 ? "HEALTHY" : "DEGRADED",
    expected: 1,
    actual,
    detail: actual > 0 ? `${actual} active FAQ item(s) present.` : "No active FAQ items — /faq will render empty.",
  };
};

export default {
  key: "faqs",
  name: "Seed FAQs",
  description: "Seeds the initial ecommerce FAQ set. No-op once any active FAQ already exists.",
  type: "SEEDER",
  category: "content",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Inserts ~22 FAQ documents on first run only.",
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
