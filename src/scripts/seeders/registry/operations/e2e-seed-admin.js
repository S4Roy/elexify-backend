// TEST_ONLY. See e2e-cleanup.js's header comment for why this is not
// invoked in-process — same reasoning applies to seedAdminE2E.js.
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  context.logger.error("e2e-seed-admin targets a dedicated, isolated E2E database and must be run via `npm run e2e:seed:admin`-equivalent script in its own process, not through the shared runner. No changes made.");
  throw new Error("CLI_ONLY: run `node src/scripts/seedAdminE2E.js` directly instead of executing this operation in-process.");
};

export default {
  key: "e2e-seed-admin",
  name: "E2E Admin Panel Seed",
  description: "Seeds the dedicated admin E2E database with admin/staff/customer/order fixtures for the admin panel Playwright suite. CLI-only — see scripts/seedAdminE2E.js.",
  type: "SEEDER",
  category: "testing",
  version: 1,
  required: false,
  idempotent: true,
  risk: "HIGH",
  allowedEnvironments: ["test"],
  dependencies: [],
  estimatedImpact: "Drops and re-seeds the entire dedicated admin E2E database (never the primary application database).",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
};
