// CRITICAL, non-idempotent financial-schema migration. idempotent:false
// tells runner.js to permanently block a second admin/CLI run of this key
// once a prior SUCCESS execution exists for the current environment — see
// runner.js's rerun-guard. Dry run reuses the exact same preflight report a
// human would run manually before ever attempting this (scripts/preflightOrderMigration.js)
// — not a separate/approximate implementation.
import { runMigrateOrderSchema } from "../../../migrateOrderSchema.js";
import { collectOrderMigrationPreflight } from "../../../preflightOrderMigration.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const report = await collectOrderMigrationPreflight();
    context.logger.info(`Preflight: safe_to_migrate=${report.safe_to_migrate}. Orders=${report.counts.orders}, legacy exchange_rate records=${report.legacy_exchange_rate_records}.`);
    if (!report.safe_to_migrate) {
      context.logger.error("Preflight found financial conflicts that must be reconciled manually before this migration can run — see the preflight report.");
    }
    // Not a real write-count preview (this is a schema/rename migration, not
    // an insert/update-count-shaped operation) — the preflight's
    // safe_to_migrate verdict plus conflict counts IS the dry-run report.
    return {
      wouldInsert: 0,
      wouldUpdate: report.legacy_exchange_rate_records,
      wouldSkip: 0,
      wouldDelete: 0,
      preflight: report,
    };
  }

  // MIGRATION_CONFIRMED env gate + the registry's own idempotent:false
  // rerun guard + requiresConfirmation (typed "RUN PRODUCTION" string at
  // the admin API layer) are three independent, deliberately redundant
  // safety layers for this one CRITICAL operation — see
  // scripts/migrateOrderSchema.js's header comment.
  const { result } = await runMigrateOrderSchema({ logger: context.logger });
  return result;
};

export default {
  key: "order-schema-migration",
  name: "Order Schema Migration (exchange_rate rename + financial indexes)",
  description: "One-time migration: renames the legacy `exchnage_rate` typo field to `exchange_rate` on Order documents and verifies required financial uniqueness indexes. Requires MIGRATION_CONFIRMED=yes in the server environment in addition to admin/CLI confirmation. Not safely rerunnable — blocked after a prior SUCCESS in this environment.",
  type: "MIGRATION",
  category: "commerce",
  version: 1,
  required: false,
  idempotent: false,
  risk: "CRITICAL",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Renames a field on every affected Order document and syncs indexes on Order/CouponUsage/StockTransaction/ProviderOrderAttempt. Financial data — requires a verified backup and a passing preflight report before running in production.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
