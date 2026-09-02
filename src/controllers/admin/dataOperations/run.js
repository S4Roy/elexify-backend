import { StatusError } from "../../../config/index.js";
import { getOperation } from "../../../scripts/seeders/registry/index.js";
import { execute, currentEnvironment } from "../../../scripts/runner.js";
import { OperationError } from "../../../scripts/shared/errors.js";
import { auditService } from "../../../services/index.js";

const AUDIT_EVENT_BY_TYPE = {
  SEEDER: "SYSTEM_SEEDER_EXECUTED",
  MIGRATION: "SYSTEM_MIGRATION_EXECUTED",
  BACKFILL: "SYSTEM_BACKFILL_EXECUTED",
  REPAIR: "SYSTEM_REPAIR_EXECUTED",
};

const REQUIRED_CONFIRMATION_PHRASE = "RUN PRODUCTION";
const HIGH_RISK_LEVELS = new Set(["HIGH", "CRITICAL"]);

// Runs a registry operation for real (dryRun: false). For HIGH/CRITICAL
// risk operations outside development, the request body MUST include a
// typed confirmation string matching REQUIRED_CONFIRMATION_PHRASE exactly
// — enforced server-side, never trusting a UI-only confirmation dialog.
export const run = async (req, res, next) => {
  try {
    const entry = getOperation(req.params.key);
    if (!entry) throw StatusError.notFound(req.__("Operation not found"));

    const environment = currentEnvironment();
    if (HIGH_RISK_LEVELS.has(entry.risk) && environment !== "development") {
      const confirmation = req.body?.confirmation;
      if (confirmation !== REQUIRED_CONFIRMATION_PHRASE) {
        throw StatusError.badRequest(
          req.__(`This is a ${entry.risk}-risk operation outside development. Confirm by sending { "confirmation": "${REQUIRED_CONFIRMATION_PHRASE}" }.`),
        );
      }
    }

    const admin_id = req.auth?.user_id;
    const outcome = await execute(req.params.key, {
      dryRun: false,
      triggerSource: "ADMIN",
      triggeredBy: admin_id,
    });

    await auditService.recordAudit({
      userId: admin_id,
      actorId: admin_id,
      event: AUDIT_EVENT_BY_TYPE[entry.type] || "SYSTEM_SEEDER_EXECUTED",
      req,
      metadata: {
        operation_key: entry.key,
        version: entry.version,
        environment: outcome.environment,
        execution_id: outcome.execution_id,
        dry_run: outcome.dry_run,
        result: outcome.result,
      },
    });

    res.status(200).json({ status: "success", message: req.__("Operation run complete"), data: outcome });
  } catch (error) {
    if (error instanceof OperationError) return next(new StatusError(error.statusCode, error.message));
    next(error);
  }
};
