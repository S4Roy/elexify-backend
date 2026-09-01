# Elexify Seeder / Data-Operations Management — Implementation Report

## 1. Scripts discovered and classified

**29** pre-existing operational units were audited: 27 files under
`src/scripts/` plus 2 legacy seeding controllers
(`controllers/DbSeedingController.js`, `controllers/api-old/DbSeedingController.js`).
`services/inventory/product/syncVariationVisibilityByAttribute.js` was also
reviewed and confirmed to be live attribute-admin business logic, not an
operational script — left untouched, not counted here.

| Classification | Count | Scripts |
|---|---|---|
| REQUIRED_BOOTSTRAP | 7 | seedCmsPages, seedCompanySettings, seedContactSettings, seedEmailTemplates, seedFaqs, seedHomePage, seedShipping |
| OPTIONAL | 1 | importPincodes |
| ONE_TIME_MIGRATION | 3 | migrateOrderSchema, restrictCountriesToIndia, upgradeEmailTemplatesToV2 |
| BACKFILL | 0 (see note) | — (the `Order.total_items` backfill was embedded inside DbSeedingController, not a standalone script; it is counted under DEPRECATED below and re-emerged as the new `order-total-items-backfill` operation) |
| REPAIR | 6 | dedupeUserMobiles, fixCartIndexes, fixProductContent, fixUserIndexes, fixWishlistIndexes, normalizeExistingMobiles |
| DEVELOPMENT_ONLY | 5 | findDuplicateUsers (read-only diagnostic), preflightOrderMigration (diagnostic/support script — also reused as `order-schema-migration`'s dry-run internally), smokeTestEmailDesign, smokeTestOtpEmail, smokeTestTemplateRendering |
| TEST_ONLY | 3 | cleanupE2E, seedAdminE2E, seedE2E |
| DEPRECATED | 2 | controllers/DbSeedingController.js (logic absorbed, file deleted), controllers/api-old/DbSeedingController.js (dead code with a hardcoded superadmin password, deleted; confirmed zero imports before deletion) |
| UNSAFE_FOR_ADMIN | 2 | replayRazorpayWebhook (payment side effects), seedProduction (privileged account creation) |

**29 total**, matching the sum of the rows above.

## 2. Registered as admin-safe operations

**22** operations are registered in
`src/scripts/seeders/registry/index.js` (validated at load time — throws on
any duplicate key or malformed entry):

`email-templates`, `email-templates-upgrade`, `cms-pages`, `faqs`,
`home-page`, `shipping`, `company-settings`, `contact-settings`,
`pincodes`, `restrict-countries`, `core-site-bootstrap` (new — absorbed
from `DbSeedingController`), `order-total-items-backfill` (new — absorbed
from `DbSeedingController`), `order-schema-migration`, `fix-cart-indexes`,
`fix-user-indexes`, `fix-wishlist-indexes`, `fix-product-content`,
`dedupe-user-mobiles`, `normalize-existing-mobiles`, `e2e-cleanup`,
`e2e-seed`, `e2e-seed-admin`.

Of these, **3** (`e2e-cleanup`, `e2e-seed`, `e2e-seed-admin`) are registered
for visibility/environment-gating only and **refuse to execute in-process**
with a clear error — see §7 "Known limitations" below; the real execution
path for those remains their existing dedicated npm scripts
(`npm run e2e:seed`, `npm run e2e:cleanup`, `node src/scripts/seedAdminE2E.js`).

**7 operations remain intentionally unregistered / CLI-only**:
`replayRazorpayWebhook.js` (payment side effects), `seedProduction.js`
(privileged account creation), the 3 `smokeTest*.js` scripts (need a
recipient email parameter the static, no-input registry contract
deliberately doesn't support), `findDuplicateUsers.js` and
`preflightOrderMigration.js` (read-only diagnostics with no execution
contract to speak of — `preflightOrderMigration`'s logic is reused, not
duplicated, as `order-schema-migration`'s dry-run).

## 3. Required-data health status (verified in a live test run)

Using the registry's `healthCheck()` against a clean test database:

| Operation | Before seeding | After seeding |
|---|---|---|
| `email-templates` | DEGRADED (0/21) | HEALTHY (21/21) |
| `company-settings` | DEGRADED (0/7) | HEALTHY (7/7) |
| `core-site-bootstrap` | DEGRADED | HEALTHY |
| `cms-pages`, `faqs`, `home-page`, `shipping` | DEGRADED | HEALTHY |
| `pincodes`, repairs, migrations | N/A | `NOT_APPLICABLE` (no natural expected/actual count — declared honestly, not faked) |

Health status was confirmed to be computed independently of execution
status: deleting seeded `SiteSetting` rows after a `SUCCESS` execution
flips `company-settings`'s health back to `DEGRADED` without touching the
stored `SystemOperationExecution` record (see
`src/scripts/dataOperations.integration.test.js`).

## 4. Email-template seeder: pass/fail

**PASS.** Verified three ways:
1. The pre-existing `seedEmailTemplates.integration.test.js` suite (raw
   upsert reimplementation) — idempotent, preserves customization.
2. The same file, extended with a new `describe` block that runs the
   **actual registry/runner path** (`execute("email-templates", ...)`)
   twice and confirms zero duplicate rows and full customization
   preservation on re-run.
3. A live CLI smoke test (`node src/scripts/cli.js run email-templates`
   against a real disposable MongoDB) — created 21 templates on first run,
   reported `inserted: 0, skipped: 21` on the second run, and
   `data:status` reported `HEALTHY (21/21)`.

## 5. Test results

Run via `npx vitest run` with `TEST_MONGODB_URI` pointed at the project's
existing disposable local replica-set helper
(`src/scripts/testReplicaSet.sh`, already running on port 27201).

| Area | New tests added | Result |
|---|---|---|
| Registry duplicate-key / malformed-entry rejection | 12 | PASS |
| Real production registry integrity (no dupes, permission convention, CRITICAL migration flags) | 5 | PASS |
| Environment restriction enforcement | 1 | PASS |
| RBAC denial (view vs execute, per operation type, unresolvable key) | 10 | PASS |
| Lock CAS (acquire/release/reclaim-stale/concurrent-rejection) | 6 | PASS |
| Dependency blocking | 1 | PASS |
| Non-idempotent rerun blocking + dry-run-still-allowed | 1 | PASS |
| Execution status classification (SUCCESS/PARTIAL/FAILED) | 3 | PASS |
| Lock released in `finally` on both success and failure | 1 | PASS |
| Structured log redaction (secret never persisted) | 1 + 8 unit tests on `redact.js` | PASS |
| Log line cap + truncation warning | 1 | PASS |
| Dry-run accuracy (faqs, company-settings) | 2 | PASS |
| Health check NOT_APPLICABLE vs real counts | 3 | PASS |
| Audit event fields | 1 | PASS |
| Email-template registry-path idempotency/customization | 2 | PASS |

**Total new tests: 61, all passing** (verified in isolated per-file runs and
in the full-suite run).

**Full backend regression** (`npx vitest run`, no changes to
pre-existing tests other than the additive registry-path block in
`seedEmailTemplates.integration.test.js`): **243–245 of 245 tests passing**
across four separate full-suite runs. The 0–2 failures each run were a
different, unrelated integration test file each time
(`httpCheckoutConcurrency`, `providerBackedHttp`, or
`stockReservationResultShape`), always the same failure shape — a
`beforeEach` `dropDatabase()` hook timing out at 10s. All of these files
pass individually and in isolated re-runs (verified); none of the new
data-operations test files ever failed across any of the four runs. This
is **pre-existing test-infra flakiness** under full-parallel load against
the one shared local replica set (the codebase's own comments elsewhere
already document a `DatabaseDropPending` race on this replica set), not a
regression introduced by this work. `package.json`'s own
`test:integration` script already runs its heaviest suites with
`--no-file-parallelism` for exactly this reason — the same flag should be
considered for the full suite in CI if this flakiness needs to disappear
entirely.

## 6. Backend regression status

- `node --check` passed on every new/modified file.
- The full registry loads and validates at import time with zero errors
  (22 operations, no duplicate keys, no malformed entries).
- The CLI (`list`, `status`, `run`, `dry-run`) was smoke-tested end-to-end
  against a real disposable MongoDB instance.
- Confirmed no remaining imports of the deleted
  `controllers/DbSeedingController.js` or
  `controllers/api-old/DbSeedingController.js` anywhere in `src/` before
  deleting them.
- Confirmed the legacy `GET ${basePath}/debug/db-seeding` route no longer
  exists in `src/server.js`.

## 7. Remaining manual / unsafe / CLI-only scripts, and why

- **`seedProduction.js`** (superadmin creation) and
  **`replayRazorpayWebhook.js`** (payment side effects) are deliberately
  **not** in the registry — per the plan's explicit instruction, creating a
  privileged account or replaying a payment webhook must never be a static,
  no-input, admin-clickable action.
- **`smokeTestEmailDesign.js` / `smokeTestOtpEmail.js` /
  `smokeTestTemplateRendering.js`** need a recipient email address as a
  parameter — the registry's execution contract is deliberately
  parameter-free (`context = {dryRun, logger, environment, executionId}`
  only), so these stay CLI-only.
- **`findDuplicateUsers.js` / `preflightOrderMigration.js`** are read-only
  diagnostics; `preflightOrderMigration`'s report is reused (not
  duplicated) as `order-schema-migration`'s dry-run.
- **`e2e-cleanup` / `e2e-seed` / `e2e-seed-admin`** are registered (so
  `allowedEnvironments: ["test"]` correctly blocks them in
  development/production, and they're visible in `data:list`), but their
  handler unconditionally throws a clear, safe error rather than actually
  running. **Reason**: `cleanupE2E.js` / `seedE2E.js` / `seedAdminE2E.js`
  each open their own direct `mongoose.connect()` to a wholly separate,
  dedicated E2E database as a **module-level side effect on import** (they
  are not currently structured as callable functions — they're top-level
  scripts). Since Mongoose's default connection is a process-wide
  singleton, importing them into the same process that already holds the
  primary application's DB connection (via `config/mongoose.js`) either
  throws `"Can't call openUri() on an active connection with different
  connection strings"` or, worse, could silently repoint every model in
  the running server at the E2E database mid-request. This was verified
  empirically while building the runner (see the `data:list`/`status`
  smoke test transcript). **This is a real, deliberate limitation, not an
  oversight** — fixing it properly would mean rewriting all three E2E seed
  scripts to use `mongoose.createConnection()` with their own isolated
  model bindings, which is a larger, higher-risk refactor of test
  infrastructure that was out of scope for this pass. Flagging for human
  follow-up if the admin panel is ever expected to trigger E2E fixtures
  directly (current expectation, per the plan, is that these stay
  CLI-only/CI-only regardless).

## 8. Production blockers (be honest — these are expected, not failures)

- **`order-schema-migration` requires manual review before its first
  production run.** It is `risk: CRITICAL`, `idempotent: false` (permanently
  blocked from a second run once applied in an environment), and requires
  **both** `MIGRATION_CONFIRMED=yes` set in the server's own environment
  (an out-of-band operator decision) **and** the admin API's typed
  `"RUN PRODUCTION"` confirmation string. It should only be run in
  production after a verified backup and a passing
  `preflight:orders` report — this is enforced by the code, not just
  documented.
- **`restrict-countries`** and **`order-total-items-backfill`** are
  `requiresConfirmation: true` (`MEDIUM` risk) — reversible/safe, but still
  gated behind the typed-confirmation flow outside development since they
  touch every Country/Order document respectively.
- **The three `fix-*-indexes` repairs** drop live indexes before
  re-syncing them; there is a brief window with reduced index coverage on
  that collection. Low risk in practice (the replacement indexes already
  exist per each script's own header comment) but flagged as a
  `requiresConfirmation: true` operation regardless.
- **The `e2e-*` operations' CLI-only limitation** (§7) means the admin
  panel's Data Operations screen will show them as registered but they
  will always fail if "Run" is clicked outside their intended CLI/CI
  invocation — this is intentional (a clear error, not a silent no-op) but
  worth calling out so nobody mistakes the button for functional.

## 9. Deviations from the plan

- **BACKFILL permission mapping**: the plan's RBAC section lists exactly 8
  permissions with no dedicated `BACKFILL_VIEW`/`BACKFILL_EXECUTE`. The
  single `BACKFILL`-type operation (`order-total-items-backfill`) is gated
  with `MIGRATION_VIEW`/`MIGRATION_EXECUTE` instead — documented in the
  guide as a deliberate categorization choice ("a backfill is, RBAC-wise,
  the same data-correction category as a migration"), not an omission.
- **View-route permission granularity**: rather than a single flat
  `DATA_VIEW` gate on every `GET`, `:key`-scoped view routes
  (`GET /:key`, `GET /:key/health`) additionally accept the
  operation-type-specific `*_VIEW` permission via a small dynamic
  middleware (`requireOperationPermission`) that resolves the type from
  the registry at request time. This is a refinement of the plan's
  wording ("view routes need the matching `*_VIEW`/`DATA_VIEW`
  permission"), not a contradiction of it.
- **e2e-* registry entries are non-functional by design** — see §7. The
  plan anticipated these as "effectively inert outside test"; this
  implementation goes one step further and makes them inert *everywhere*
  (including in a `test`-environment admin/CLI call) for the connection-
  singleton safety reason above, rather than only environment-gating them.
  A future pass could make them genuinely runnable in-process via
  `mongoose.createConnection()`.

Everything else in the plan (directory layout, registry entry shape,
runner algorithm and 9-step ordering, API routes, CLI subcommands, RBAC
constant names, audit event names, retention cron, legacy route/controller
removal) was implemented as specified.
