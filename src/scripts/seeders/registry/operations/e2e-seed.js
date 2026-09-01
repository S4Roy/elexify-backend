// TEST_ONLY. See e2e-cleanup.js's header comment for why this is not
// invoked in-process — same reasoning applies to seedE2E.js.
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  context.logger.error("e2e-seed targets a dedicated, isolated E2E database and must be run via `npm run e2e:seed` in its own process, not through the shared runner. No changes made.");
  throw new Error("CLI_ONLY: run `npm run e2e:seed` directly instead of executing this operation in-process.");
};

export default {
  key: "e2e-seed",
  name: "E2E Storefront Seed",
  description: "Seeds the dedicated E2E database with customer/product/cart/coupon fixtures for the storefront Playwright suite. CLI-only — see scripts/seedE2E.js and `npm run e2e:seed`.",
  type: "SEEDER",
  category: "testing",
  version: 1,
  required: false,
  idempotent: true,
  risk: "HIGH",
  allowedEnvironments: ["test"],
  dependencies: [],
  estimatedImpact: "Drops and re-seeds the entire dedicated E2E database (never the primary application database).",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
};
