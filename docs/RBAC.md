# RBAC audit and implementation plan

## Audit (before implementation)
Express 4 / Mongoose 6 backend; Angular 20 standalone admin. JWT contains user ID and legacy role. `accessToken.js` verifies JWT; `userAdminAccessControl.js` permits five fixed roles. `requirePermission.js` and `requireOperationPermission.js` read static `adminPermissions.js`. Most CRUD routes have no granular gate. `User.role` is an enum; userRole services are commented-out remnants, with no Role/Permission collections. Angular authGuard only checks token presence; module action arrays default to add/edit/delete. Existing AuditLog records sensitive operations. Existing data operations use a registry and CLI.

Products, orders and users have no store/tenant ownership or membership fields. `seller_details` is an unused legacy reference; Zoho organization fields identify an external integration, not admin tenancy. This implementation is installation-scoped; no client-provided tenant scope is accepted by RBAC APIs. A future multi-tenant product requires resource ownership and membership enforcement, not merely adding tenant IDs to roles.

## Architecture and planned files
- Add `models/Role.js`, `models/Permission.js`; extend `models/User.js` with nullable indexed `admin_role_id`. Keep legacy role enum for storefront compatibility; a custom-role staff account retains account type `staff`.
- Add `services/rbac/{authorization,migrate}.js` and migration CLI. Store permission keys in validated arrays, backed by unique Permission documents. MongoDB has no foreign keys: service validation, role tombstones and assignment checks enforce references.
- Extend `middleware/{userAdminAccessControl,requirePermission,requireOperationPermission,accessToken}.js`; explicitly protect endpoints in `routes/admin/**/*.js`. Existing keys remain valid; new keys use resource.action. No role-name authorization fallback after migration.
- Add `routes/admin/role.js`: role CRUD, duplicate, permissions, current context, staff CRUD/assignment. Protected legacy owner role cannot be edited, disabled, deleted or assigned through UI; only migration maps existing owners. Other system roles cannot be deleted. Delegation requires all permissions of source and target roles; self assignment is refused.
- Extend `models/AuditLog.js` for RBAC events. Use safe metadata only.
- Angular: add central `PermissionService`, permission route guard, access-denied page and roles editor under settings; update shared helpers, navigation, module actions and sensitive controls.
- Request-local permissions, no cross-request server cache. Role changes take effect on the next request even for existing JWTs. UI reloads on route navigation; backend always rechecks.
- Tests: HTTP permission gates, migration, delegation constraints, inactive/deleted role behavior, stale token/context behavior, complete route gate coverage, frontend permission helpers/guard, existing backend suite and Angular build.

## Compatibility and deployment risks
Run migration BEFORE switching application code; migration is additive/idempotent and never overwrites custom or ordinary legacy-role permissions or revoked assignments; the protected owner is the explicit exception described below. Legacy access is intentionally broad where old endpoints had no granular checks. Review/restrict migrated roles after rollout. New RBAC management permissions are initially owner-only. Keep backup/snapshot before migration. Rollback application code leaves additive fields/collections intact; do not delete RBAC data on rollback. Rollback to legacy code restores legacy role-based access, so do not use rollback as a permission-revocation strategy. No production database mutation is part of local verification.

## Deployment procedure
1. Use the existing supported Node runtime and a MongoDB replica set (role/staff mutations and their audit records are transactional, consistent with order workflows).
2. Back up the database. In the backend checkout run `node src/scripts/migrateRbac.js --dry-run`, review the unassigned count, then `node src/scripts/migrateRbac.js` against the intended deployment environment. The CLI uses existing env configuration and never prints the connection URI.
3. Confirm every existing admin user has `admin_role_id`; deploy backend and admin together. Migration must finish before the new backend takes traffic. There is deliberately no runtime legacy-role fallback.
4. Sign in as an existing owner, open Settings → Roles & Permissions, and test a restricted account before broader rollout. All seeded legacy roles preserve the broad access previously allowed by ungated endpoints; migration is not an automatic least-privilege reduction.
5. The owner assignment is protected from API changes. Recovery/owner transfer requires a deliberate database administration procedure and audit outside the application; arbitrary role names never confer owner access.

Permission keys use existing singular legacy keys where already established and resource.action keys for newly gated modules. Combined legacy upsert endpoints authorize create versus update separately. Order cancellation can initiate refunds and therefore requires both cancellation and refund permission. Return inspection can submit refunds and requires return review plus refund permission. No wildcard grants are used.

`PUT /admin/role/:id` replaces the permission array and checks `version` against `__v`; reload after 409. Assignments and deletions serialize through a role write in a transaction. Deleted roles are tombstoned; assigned roles cannot be deleted. Removing an assignment sets it to null and retains `rbac_migrated`, so rerunning migration cannot restore revoked access. Role/staff audit records commit with the mutation. Other successful gated mutations append a best-effort administrative audit event containing permission keys, method, path and target ID only.

Server permission resolution performs one user and one role query per request, reused by every gate. There is no persistent server permission cache to invalidate. The browser refreshes permissions on navigation; an already-open page may show stale controls until navigation, but every API call enforces current server state.


## Designated existing owner
`baseweb.in@gmail.com` is the designated **existing superadmin**. `services/rbac/owner.js` seeds the permission catalog and synchronizes the protected existing owner role to every Permission record at startup (before listen) and whenever the migration runs. Assignment, permission refresh and owner audit commit transactionally. No password is created/reset, blocked accounts remain blocked, deleted accounts are ignored, and a customer with the same email is never promoted. All migrated superadmins share the protected role and retain full catalog access. Other role assignments remain dynamic and untouched by startup seeding. There is no authorization bypass based on email or role label.

The initial migration is still required for other existing admin accounts before deployment. The designated owner bootstraps automatically when the updated backend starts. Owner/catalog bootstrap failure prevents the HTTP server from accepting traffic.

## Verification results
- Production Angular build passed using installed Node 22.12.0 (no package upgrades). Existing Sass/CommonJS warnings remain.
- Full Angular suite passed 128 tests, including the direct-URL guard test.
- Full backend run: 744 passed, 126 skipped, 2 failures in unchanged Zoho customer-name expectations. Both Zoho failures were reproduced from an untouched HEAD snapshot.
- Targeted middleware/API regression run: 66 passed. Latest owner bootstrap + RBAC + checkout concurrency run: 23 passed, including 9 transactional RBAC integration tests.
- Existing checkout/payment integration run: 33 passed and one intermittent simultaneous-checkout failure. The seven-test concurrency suite subsequently passed in both the changed checkout and an untouched HEAD snapshot. This does not establish that the existing intermittent checkout race is resolved.
- `git diff --check` passes in both repositories. No lint script is defined in either package; backend syntax, unit/integration tests and Angular compilation/build were used.
- All mutation tests use a separate localhost replica set on port 27028 with disposable databases. Application database inspection was read-only. Applying the broader configured-database migration was rejected by automatic approval review and was not executed. A subsequent read-only verification confirmed the designated owner already has all 163 registered permissions, zero missing permissions, an active protected role, and zero legacy admins awaiting migration. The broader migration is unnecessary for the verified current owner access.
