# Elexify Data Operations Guide

A centralized, RBAC-gated, audited system for running seeders, migrations,
backfills, and repairs — from the admin panel or the CLI — instead of
running ad hoc `node` scripts or hitting an unauthenticated debug route.

## 1. Directory structure

```
src/scripts/
  seeders/registry/
    index.js                 # aggregates + validates every operation def (throws at load time on
                              # a duplicate key or a malformed entry)
    operations/*.js           # one file per operation — see "Registering a new operation" below
  shared/
    logger.js                 # {logs:[], info/warn/error} — same shape as the original
                               # services/emailTemplate/seedRunner.js pattern
    redact.js                  # central secret redaction, used on every log line and every
                               # persisted result/metadata object
    lock.js                    # Mongo CAS lock (SystemOperationLock) with stale-heartbeat takeover
    result.js                  # buildResult({inserted,updated,skipped,deleted,warnings}) helper
    errors.js                  # OperationError (safe, coded errors) and PartialExecutionError
  runner.js                    # execute(key, {dryRun, triggerSource, triggeredBy}) — the ONE path
                               # both the CLI and the admin API call
  cli.js                       # list | status | run <key> | dry-run <key>

src/models/
  SystemOperationExecution.js  # one doc per run attempt — long retention (audit trail)
  SystemOperationLog.js        # per-line logs for a run — short retention (cron-cleaned)
  SystemOperationLock.js       # one doc per operation_key — the CAS lock

src/routes/admin/dataOperations.js
src/controllers/admin/dataOperations/*.js
src/middleware/requireOperationPermission.js
```

Every legacy script that a registry operation delegates to (`seedFaqs.js`,
`fixProductContent.js`, `migrateOrderSchema.js`, etc.) still lives at its
original path under `src/scripts/` and still works standalone via
`node src/scripts/<name>.js` — the registry operation is a thin adapter
that imports and calls the script's exported `runXxx()` function, it never
duplicates the underlying logic.

## 2. Operation types — semantic distinctions

| Type | Meaning | Idempotent? | Example |
|---|---|---|---|
| **SEEDER** | Creates baseline/default data a fresh environment needs. Always insert-if-missing (`$setOnInsert`), never overwrites an existing/customized row. | Always `idempotent: true`. | `email-templates`, `cms-pages`, `core-site-bootstrap` |
| **MIGRATION** | Changes schema shape, renames/moves a field, or applies a one-time content upgrade. May be a one-time, non-reversible change. | Can be `false` (e.g. `order-schema-migration` — blocked from re-running once applied). | `order-schema-migration`, `restrict-countries`, `email-templates-upgrade` |
| **BACKFILL** | Recomputes/fills a derived field from existing data (not new baseline data, not a schema change). Safe to re-run — it always converges to the same correct value. | `idempotent: true`. | `order-total-items-backfill` |
| **REPAIR** | Fixes a data-quality or index problem (stale indexes, duplicate records, malformed content). Usually has a real dry-run/apply flag already. | `idempotent: true`. | `fix-cart-indexes`, `dedupe-user-mobiles`, `fix-product-content` |

The distinction matters for **RBAC** (permissions are per-type) and for the
**audit event** recorded on every real run (`SYSTEM_SEEDER_EXECUTED`,
`SYSTEM_MIGRATION_EXECUTED`, `SYSTEM_BACKFILL_EXECUTED`,
`SYSTEM_REPAIR_EXECUTED`). `BACKFILL` operations are grouped with
`MIGRATION` permissions (`system.migration.view` / `.execute`) — there is
no separate `BACKFILL_*` permission — because a backfill is, RBAC-wise, the
same "data correction" category as a migration, as opposed to a first-time
`SEEDER` or a data-quality `REPAIR`.

## 3. Registering a new operation

1. Create `src/scripts/seeders/registry/operations/<key>.js` exporting a
   default object with this exact shape:

```js
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  // context = { dryRun, logger, environment, executionId }
  if (context.dryRun) {
    // Only implement this branch if an accurate, side-effect-free preview
    // is achievable (see "Dry run" below). Return the dry-run shape:
    return { wouldInsert: 0, wouldUpdate: 0, wouldSkip: 0, wouldDelete: 0 };
  }

  // Do the real work. Log through context.logger, not console.log.
  context.logger.info("Doing the thing...");

  // Return the execution-contract result shape:
  return { inserted: 0, updated: 0, skipped: 0, deleted: 0, warnings: [] };
};

// Optional — only add this if there's a real expected-vs-actual count to
// check (see "Health checks" below).
const healthCheck = async (context) => ({
  status: "HEALTHY", // or "DEGRADED"
  expected: 1,
  actual: 1,
  detail: "human-readable detail",
});

export default {
  key: "my-new-operation",          // lowercase-kebab-case, unique
  name: "My New Operation",
  description: "One sentence describing what this does and its safety properties.",
  type: "SEEDER",                    // SEEDER | MIGRATION | BACKFILL | REPAIR
  category: "content",               // free-form grouping label for the admin UI
  version: 1,
  required: false,                   // true only for REQUIRED_BOOTSTRAP-class seeders
  idempotent: true,                  // false only for a genuinely non-rerunnable migration
  risk: "LOW",                       // LOW | MEDIUM | HIGH | CRITICAL
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],                  // array of other operation keys that must have SUCCEEDED first
  estimatedImpact: "One sentence describing what gets written/changed.",
  supportsDryRun: false,             // true only if handler implements an accurate preview
  requiresConfirmation: false,       // true for MEDIUM+ risk / destructive operations
  permission: PERMISSIONS.SEEDER_EXECUTE, // matches the type (see RBAC below)
  handler,
  healthCheck,                        // omit entirely if there's no meaningful health signal
};
```

2. Add it to the `RAW_ENTRIES` array in
   `src/scripts/seeders/registry/index.js`. The registry throws at import
   time (server boot, CLI start, and test run) if the key is a duplicate or
   the entry is malformed — you cannot silently ship a broken registration.

3. If it should be reachable from an existing npm script name, update
   `package.json` so that script calls
   `node src/scripts/cli.js run <key>` (or `dry-run <key>`).

4. Add tests: at minimum, exercise the handler directly (unit) and, if it
   has real dependencies/side effects, an integration test that runs it
   through `runner.execute()` against a real test database.

### Pre-registration checklist

Before adding a new key to `RAW_ENTRIES`, confirm all of the following:

- [ ] `key` is lowercase-kebab-case and doesn't collide with an existing key.
- [ ] `type`/`risk`/`allowedEnvironments` accurately describe the operation — don't under-declare risk to avoid the confirmation prompt.
- [ ] If `idempotent: false`, you have a specific, documented reason a second run is unsafe, and `requiresConfirmation: true` is set.
- [ ] `handler` never touches `child_process`, never accepts a path/command from `context`, and only calls already-existing, already-reviewed business logic (import a function — don't duplicate its logic).
- [ ] Every log line goes through `context.logger`, never raw `console.log` (so it's captured, redacted, and persisted).
- [ ] Nothing secret-shaped (password, token, OTP, connection string, API key) is ever placed in the handler's return value or a log message — the central redactor (`shared/redact.js`) is a safety net, not a substitute for not logging secrets in the first place.
- [ ] If `supportsDryRun: true`, the dry-run branch performs zero writes and its counts are verified against reality in a test.
- [ ] `permission` is one of the 8 constants in `constants/adminPermissions.js`, matching `type`.
- [ ] If this operation should never be reachable from the admin panel (e.g. it needs a per-invocation parameter, like `replayRazorpayWebhook.js`, or has irreversible payment side effects, or creates a privileged account), **do not register it** — leave it as a standalone CLI script.

## 4. Idempotency requirements

- A `SEEDER` MUST use `$setOnInsert` (or an equivalent insert-if-missing
  pattern) and MUST NOT overwrite an existing/customized row. This was a
  real historical bug fixed as part of this migration:
  `scripts/seedContactSettings.js` used a blind `$set` before — it's now
  `$setOnInsert`, matching every other seeder.
- A `BACKFILL` MUST converge to the same correct value no matter how many
  times it runs (it recomputes a derived field from source-of-truth data).
- A `REPAIR` MUST be safe to run again after it already fixed everything
  (a second run should find nothing left to do).
- A `MIGRATION` MAY be `idempotent: false` when a second run would be
  actively unsafe (e.g. renaming a field a second time would clobber
  legitimate new data). `runner.js` permanently blocks a second real run
  of a non-idempotent operation once a prior `SUCCESS` execution exists for
  the current environment — there is no generic "reset and rerun" button.
  A dry run of a non-idempotent operation is still always allowed (it's
  read-only).

## 5. Logging conventions

Every handler receives `context.logger` with `.info(message)`,
`.warn(message)`, `.error(message)`. Every message is redacted
(`shared/redact.js`) both when pushed onto the in-memory log array and
again defensively by the runner before it's persisted to
`SystemOperationLog`. Logs are capped at **500 lines per execution** — if a
handler logs more, the first 499 lines are kept and a final
`"…N line(s) truncated"` warning line is appended, rather than growing the
collection unbounded.

Never call `console.log` directly inside a handler — it won't be captured,
shown in the admin log viewer, or redacted.

## 6. Health checks

`healthCheck(context)` is a **separate, read-only** signal from execution
status — "this operation ran successfully in the past" is not the same
claim as "this data is currently healthy" (an admin could have since
deleted the seeded rows by hand, or a migration could have partially
regressed). A health check:

- Never writes anything.
- Returns `{ status: "HEALTHY" | "DEGRADED", expected, actual, detail }`.
- Is entirely optional — omit it if there's no natural expected-vs-actual
  count (e.g. `pincodes`, `dedupe-user-mobiles`). The admin API reports
  `NOT_APPLICABLE` for any operation with no `healthCheck`.

## 7. Dry run

`supportsDryRun: true` is only declared where an accurate, zero-write
preview is genuinely achievable:

- Every `$setOnInsert`-style seeder counts what's currently missing
  (`email-templates`, `cms-pages`, `faqs`, `home-page`, `shipping`,
  `company-settings`, `contact-settings`, `core-site-bootstrap`,
  `restrict-countries`, `order-total-items-backfill`).
- The repair scripts that already ship a `--dry-run`/`--apply` flag reuse
  that exact logic (`fix-product-content`, `dedupe-user-mobiles`,
  `normalize-existing-mobiles`) — the registry adapter does not
  reimplement their diffing.
- `order-schema-migration`'s "dry run" is the existing
  `preflightOrderMigration.js` conflict report — the same report an
  operator would run manually before ever attempting the real migration.
- Everything else (`pincodes`, the three `fix-*-indexes` repairs, the
  `e2e-*` operations) honestly declares `supportsDryRun: false` rather than
  faking an estimate.

## 8. CLI usage

```bash
npm run data:list                   # list every registered operation and its risk/status
npm run data:status                 # last execution + health for every operation
npm run data:status -- <key>        # status for one operation
npm run data:run -- <key>           # run for real (triggerSource: CLI)
npm run data:dry-run -- <key>       # preview only, zero writes
```

Exit code is `0` on `SUCCESS`, non-zero on `FAILED`/`PARTIAL`/any thrown
error — safe for CI gating. Existing npm scripts
(`seed:email-templates`, `upgrade:email-templates-v2`, `migrate:orders`,
`import:pincodes`) still work with the exact same names; they now delegate
to `node src/scripts/cli.js run <key>` internally instead of calling the
handler directly, so no deployment tooling needs to change.

## 9. Admin execution flow

1. `GET /admin/data-operations` — list every operation, its type/risk, and
   its last execution/health in the current environment.
2. `GET /admin/data-operations/:key` — full detail, including dependency
   status.
3. `GET /admin/data-operations/:key/health` — on-demand health check.
4. `POST /admin/data-operations/:key/dry-run` — preview (only if
   `supportsDryRun`).
5. `POST /admin/data-operations/:key/run` — real execution. For `HIGH`/
   `CRITICAL` risk operations outside `development`, the request body MUST
   include `{ "confirmation": "RUN PRODUCTION" }` exactly, or the server
   rejects with 400 — enforced server-side, never trusting a UI dialog
   alone.
6. `GET /admin/data-operations/executions` /
   `GET /admin/data-operations/executions/:id` /
   `GET /admin/data-operations/executions/:id/logs` — execution history and
   per-line logs.

Every real run records an audit event
(`services/audit/recordAudit.js`) with
`metadata: { operation_key, version, environment, execution_id, dry_run, result }`
— the same convention `controllers/admin/emailTemplate/seedRun.js` already
used.

## 10. RBAC permission list

Defined in `src/constants/adminPermissions.js`:

| Permission constant | String | superadmin | manager |
|---|---|---|---|
| `DATA_VIEW` | `system.data.view` | ✅ | ✅ |
| `SEEDER_VIEW` | `system.seeder.view` | ✅ | ✅ |
| `SEEDER_EXECUTE` | `system.seeder.execute` | ✅ | ❌ |
| `MIGRATION_VIEW` | `system.migration.view` | ✅ | ✅ |
| `MIGRATION_EXECUTE` | `system.migration.execute` | ✅ | ❌ |
| `REPAIR_VIEW` | `system.repair.view` | ✅ | ✅ |
| `REPAIR_EXECUTE` | `system.repair.execute` | ✅ | ❌ |
| `OPERATION_HISTORY_VIEW` | `system.operation.history.view` | ✅ | ✅ |

`supervisor`/`staff`/`operator` hold none of these. Every route is gated
with `requirePermission`-style middleware
(`src/middleware/requireOperationPermission.js`) that resolves the
operation's `type` from the registry via `:key` and checks the matching
`*_VIEW`/`*_EXECUTE` permission — the mapping is not hardcoded per route.

## 11. Production safety rules

- **Typed confirmation**: any `HIGH`/`CRITICAL` risk operation run outside
  `development` requires `{ "confirmation": "RUN PRODUCTION" }` in the
  request body. This is checked in `controllers/admin/dataOperations/run.js`
  server-side — a compromised or buggy admin UI cannot bypass it.
- **Environment restriction**: `allowedEnvironments` is checked in
  `runner.js` itself, not just hidden in the UI. `test`-only operations
  (`e2e-cleanup`, `e2e-seed`, `e2e-seed-admin`) get
  `OPERATION_NOT_ALLOWED_IN_ENVIRONMENT` everywhere except `test`.
- **No free-form input**: the admin API and the CLI only ever accept a
  registry `key` — never a script path, filename, shell command, or
  eval'd string. `runner.js` resolves `key` through the static registry
  and 404s (`OPERATION_NOT_FOUND`) on anything else, including
  path-traversal-shaped strings.
- **No `child_process`**: no handler shells out, so there is no surface for
  command injection regardless of what a `key` resolves to.
- **Concurrency lock**: a CAS lock (`SystemOperationLock`) prevents two
  overlapping real runs of the same operation, across multiple backend
  instances (it's DB-backed, not in-memory). A stale lock (no heartbeat
  update for 10 minutes — a crashed process) is automatically reclaimed.

## 12. Migration rerun rules

An operation with `idempotent: false` (currently only
`order-schema-migration`) can run **at most once per environment**. Once a
`SUCCESS` execution exists for that key + environment, `runner.js` rejects
any further real-run attempt with `OPERATION_ALREADY_APPLIED` and a message
naming when it was previously applied — there is no generic reset/override
button, by design. A dry run is still always permitted (it's the
preflight report, and never mutates data).

`order-schema-migration` additionally requires `MIGRATION_CONFIRMED=yes` to
be set in the **server's own environment** — an operator decision made
out-of-band from any HTTP request, on top of the admin API's typed
confirmation string. Both gates must pass; see
`scripts/migrateOrderSchema.js`'s header comment.

## 13. Dev/test-only environment restriction enforcement

`allowedEnvironments` is enforced in exactly one place —
`runner.js`'s `execute()` — checked against
`currentEnvironment()` (derived from `NODE_ENV`, aliased `dev` →
`development`). This is checked for **every** trigger source (CLI, ADMIN,
DEPLOYMENT, SYSTEM) — there's no code path that skips it. A `test`-only
operation invoked in `development` or `production` (via CLI or admin) gets
the same `OPERATION_NOT_ALLOWED_IN_ENVIRONMENT` error either way.

## 14. Retention

`SystemOperationLog` (per-line logs) is cleaned up by a daily cron
(`server.js`, 02:30) after
`SYSTEM_OPERATION_LOG_RETENTION_DAYS` (env-configurable, default 30 days).
`SystemOperationExecution` (the summary/audit trail of what ran, when, by
whom, with what result) and `AuditLog` are **never** touched by this cron —
they're the long-retention, audit-purpose records.
