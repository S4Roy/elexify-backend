import HomePage from "../../../../models/HomePage.js";
import { runSeedHomePage } from "../../../seedHomePage.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const homePage = await HomePage.getSingleton();
    const wouldInsert = homePage.sections.length ? 0 : 8;
    context.logger.info(wouldInsert ? `Dry run: would seed ${wouldInsert} default homepage section(s).` : "Dry run: homepage already has sections — nothing would change.");
    return { wouldInsert, wouldUpdate: 0, wouldSkip: wouldInsert ? 0 : 1, wouldDelete: 0 };
  }

  const { result } = await runSeedHomePage({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const homePage = await HomePage.getSingleton();
  const actual = homePage.sections.length;
  return {
    status: actual > 0 ? "HEALTHY" : "DEGRADED",
    expected: 1,
    actual,
    detail: actual > 0 ? `${actual} homepage section(s) configured.` : "Homepage has no sections — storefront homepage will render blank.",
  };
};

export default {
  key: "home-page",
  name: "Seed Home Page",
  description: "Seeds the homepage singleton with the default section layout (Hero, product rows, trust badges, CTA). No-op once any sections already exist.",
  type: "SEEDER",
  category: "content",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Creates and publishes ~8 homepage sections on first run only.",
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
