// TEST_ONLY. cleanupE2E.js / seedE2E.js / seedAdminE2E.js connect directly
// to a wholly separate, dedicated E2E Mongo URI (E2E_MONGODB_URI) via their
// own top-level `mongoose.connect(...)` call and then dropDatabase() —
// deliberately NOT invoked in-process here. Doing so would call
// mongoose.connect() a second time on the SAME global mongoose singleton
// this server process already opened against the primary database (see
// config/mongoose.js), which either throws or — worse — could silently
// repoint every model in this process at the E2E database mid-request.
// Registered anyway so it's visible in `data:list` / the admin panel and so
// allowedEnvironments correctly blocks it everywhere but test (per plan
// classification: "Registered but effectively inert outside test"); the
// only supported way to actually run it is its own npm script, which
// starts a dedicated, short-lived process with no other DB work in flight.
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  context.logger.error("e2e-cleanup targets a dedicated, isolated E2E database and must be run via `npm run e2e:cleanup` in its own process, not through the shared runner. No changes made.");
  throw new Error("CLI_ONLY: run `npm run e2e:cleanup` directly instead of executing this operation in-process.");
};

export default {
  key: "e2e-cleanup",
  name: "E2E Database Cleanup",
  description: "Drops the dedicated E2E test database. CLI-only — see scripts/cleanupE2E.js and `npm run e2e:cleanup`.",
  type: "REPAIR",
  category: "testing",
  version: 1,
  required: false,
  idempotent: true,
  risk: "HIGH",
  allowedEnvironments: ["test"],
  dependencies: [],
  estimatedImpact: "Drops the entire dedicated E2E database (never the primary application database — guarded by assertSafeE2EDatabase).",
  supportsDryRun: false,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
