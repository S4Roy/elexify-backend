// The ONE code path both the CLI (cli.js) and the admin API
// (controllers/admin/dataOperations/*.js) call to execute a registry
// operation. Never accepts a free-form path/command — `key` is always
// resolved through seeders/registry/index.js's static registry.
import { envs } from "../config/index.js";
import { getOperation } from "./seeders/registry/index.js";
import { createLogger } from "./shared/logger.js";
import { redact, redactMessage } from "./shared/redact.js";
import { acquireLock, releaseLock, stampLockExecutionId } from "./shared/lock.js";
import { OperationError, PartialExecutionError } from "./shared/errors.js";
import SystemOperationExecution from "../models/SystemOperationExecution.js";
import SystemOperationLog from "../models/SystemOperationLog.js";

const MAX_LOG_LINES = 500;

const ENVIRONMENT_ALIASES = { dev: "development", development: "development", test: "test", production: "production" };

export const currentEnvironment = () => ENVIRONMENT_ALIASES[envs.env] || "development";

// A "prior successful execution" for a dependency/idempotency check means a
// SUCCESS (non-dry-run) execution of that key in the current environment.
// Dry runs never satisfy a dependency or "already applied" check — they
// never mutate data, so they can't be evidence anything actually happened.
const findPriorSuccess = (operationKey, environment) =>
  SystemOperationExecution.findOne({ operation_key: operationKey, environment, status: "SUCCESS", dry_run: false })
    .sort({ created_at: -1 })
    .lean();

const persistLogs = async (executionId, logs) => {
  const truncated = logs.length > MAX_LOG_LINES;
  const linesToPersist = truncated ? logs.slice(0, MAX_LOG_LINES - 1) : logs;

  const docs = linesToPersist.map((line) => ({
    execution_id: executionId,
    level: line.level,
    message: redactMessage(line.message),
    timestamp: new Date(line.timestamp),
  }));

  if (truncated) {
    docs.push({
      execution_id: executionId,
      level: "WARN",
      message: `…${logs.length - linesToPersist.length} line(s) truncated (log cap is ${MAX_LOG_LINES} lines per execution).`,
      timestamp: new Date(),
    });
  }

  if (docs.length) await SystemOperationLog.insertMany(docs);
  return { count: docs.length, truncated };
};

const safeError = (error) => ({
  code: error instanceof OperationError ? error.code : "OPERATION_FAILED",
  safe_message: redactMessage(String(error?.message || "Unknown error")),
});

// execute(key, {dryRun, triggerSource, triggeredBy}) — see plan for the
// full 9-step algorithm; each numbered comment below maps onto one step.
export const execute = async (key, { dryRun = false, triggerSource, triggeredBy = null } = {}) => {
  if (!triggerSource) throw new OperationError("INVALID_TRIGGER_SOURCE", "triggerSource is required", 400);

  // 1. Resolve key from the static registry — never a free-form path/command.
  const entry = getOperation(key);
  if (!entry) throw new OperationError("OPERATION_NOT_FOUND", `No registered data operation with key "${key}".`, 404);

  // 2. Environment restriction — enforced here regardless of caller/UI.
  const environment = currentEnvironment();
  if (!entry.allowedEnvironments.includes(environment)) {
    throw new OperationError(
      "OPERATION_NOT_ALLOWED_IN_ENVIRONMENT",
      `Operation "${key}" is not allowed in the "${environment}" environment (allowed: ${entry.allowedEnvironments.join(", ")}).`,
      403,
    );
  }

  // 3. Dependencies must have a prior SUCCESS in this environment.
  for (const dependencyKey of entry.dependencies) {
    const prior = await findPriorSuccess(dependencyKey, environment);
    if (!prior) {
      const dependencyEntry = getOperation(dependencyKey);
      throw new OperationError(
        "OPERATION_DEPENDENCY_NOT_SATISFIED",
        `Operation "${key}" requires "${dependencyEntry?.name || dependencyKey}" (${dependencyKey}) to have succeeded in the "${environment}" environment first.`,
        409,
      );
    }
  }

  // Non-idempotent operations refuse a second real run once already
  // applied in this environment — no generic reset button. Dry runs are
  // always allowed (read-only preview).
  if (!entry.idempotent && !dryRun) {
    const prior = await findPriorSuccess(key, environment);
    if (prior) {
      throw new OperationError(
        "OPERATION_ALREADY_APPLIED",
        `"${entry.name}" already completed successfully in the "${environment}" environment on ${prior.created_at?.toISOString?.() || prior.created_at} and is not safely rerunnable.`,
        409,
      );
    }
  }

  // 4. Acquire the CAS lock — only for real runs; a dry run never mutates
  // data so concurrent previews are safe and shouldn't block each other.
  let lockAcquired = false;
  if (!dryRun) {
    const lock = await acquireLock(key, { holderId: triggeredBy, executionId: null });
    if (!lock) {
      throw new OperationError("OPERATION_ALREADY_RUNNING", `"${entry.name}" is already running. Wait for it to finish or for the lock to expire.`, 409);
    }
    lockAcquired = true;
  }

  // 5. Create the execution record (QUEUED -> RUNNING).
  const execution = await SystemOperationExecution.create({
    operation_key: key,
    operation_name: entry.name,
    operation_type: entry.type,
    operation_version: entry.version,
    environment,
    status: "RUNNING",
    dry_run: dryRun,
    trigger_source: triggerSource,
    triggered_by: triggeredBy,
    started_at: new Date(),
  });

  // Stamp the lock with the real execution id now that we have one, so
  // releaseLock's {operation_key, execution_id} match check is meaningful.
  // Not a second CAS acquire — we already hold this lock outright.
  if (lockAcquired) {
    await stampLockExecutionId(key, execution._id);
  }

  const logger = createLogger();
  const context = { dryRun, logger, environment, executionId: execution._id.toString() };

  let status;
  let result = null;
  let error = null;

  try {
    const handlerResult = await entry.handler(context);
    result = redact(handlerResult ?? {});
    status = "SUCCESS";
  } catch (caught) {
    if (caught instanceof PartialExecutionError) {
      status = "PARTIAL";
      result = redact(caught.partialResult ?? {});
      error = safeError(caught);
      logger.error(`Partial failure: ${caught.message}`);
    } else {
      status = "FAILED";
      result = null;
      error = safeError(caught);
      logger.error(`Failed: ${caught?.message || caught}`);
    }
  } finally {
    const { count: logLineCount, truncated: logTruncated } = await persistLogs(execution._id, logger.logs);
    const completedAt = new Date();
    await SystemOperationExecution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status,
          result,
          error,
          completed_at: completedAt,
          duration_ms: completedAt.getTime() - execution.started_at.getTime(),
          log_line_count: logLineCount,
          log_truncated: logTruncated,
        },
      },
    );
    if (lockAcquired) await releaseLock(key, execution._id);
  }

  return {
    executionId: execution._id.toString(),
    operationKey: key,
    status,
    dryRun,
    environment,
    result,
    error,
  };
};
