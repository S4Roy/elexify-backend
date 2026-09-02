import { StatusError } from "../../../config/index.js";
import { getOperation } from "../../../scripts/seeders/registry/index.js";
import { currentEnvironment } from "../../../scripts/runner.js";
import { normalizeHealth } from "../../../scripts/shared/health.js";
import SystemOperationExecution from "../../../models/SystemOperationExecution.js";

export const details = async (req, res, next) => {
  try {
    const entry = getOperation(req.params.key);
    if (!entry) throw StatusError.notFound(req.__("Operation not found"));

    const environment = currentEnvironment();
    const lastExecution = await SystemOperationExecution.findOne({ operation_key: entry.key, environment })
      .sort({ created_at: -1 })
      .lean();
    const lastSuccess = await SystemOperationExecution.findOne({ operation_key: entry.key, environment, status: "SUCCESS", dry_run: false })
      .sort({ created_at: -1 })
      .lean();

    const dependencyStatus = await Promise.all(
      entry.dependencies.map(async (depKey) => {
        const depEntry = getOperation(depKey);
        const depSuccess = await SystemOperationExecution.findOne({ operation_key: depKey, environment, status: "SUCCESS", dry_run: false })
          .sort({ created_at: -1 })
          .lean();
        return { key: depKey, name: depEntry?.name || depKey, satisfied: Boolean(depSuccess) };
      }),
    );

    let health = { status: "NOT_APPLICABLE" };
    if (typeof entry.healthCheck === "function") {
      try {
        health = normalizeHealth(await entry.healthCheck({ environment }));
      } catch (e) {
        health = { status: "ERROR", detail: e.message };
      }
    }

    const recentExecutions = await SystemOperationExecution.find({ operation_key: entry.key, environment })
      .sort({ created_at: -1 })
      .limit(10)
      .lean();
    const previousExecutions = recentExecutions.map((exec) => ({
      execution_id: String(exec._id),
      operation_key: exec.operation_key,
      operation_name: exec.operation_name,
      status: exec.status,
      started_at: exec.started_at,
      completed_at: exec.completed_at,
      duration_ms: exec.duration_ms,
      trigger_source: exec.trigger_source,
      triggered_by: exec.triggered_by ? String(exec.triggered_by) : null,
    }));

    res.status(200).json({
      status: "success",
      message: req.__("Operation detail"),
      data: {
        key: entry.key,
        name: entry.name,
        description: entry.description,
        type: entry.type,
        category: entry.category,
        version: entry.version,
        required: entry.required,
        idempotent: entry.idempotent,
        risk: entry.risk,
        allowedEnvironments: entry.allowedEnvironments,
        allowedInCurrentEnvironment: entry.allowedEnvironments.includes(environment),
        dependencies: dependencyStatus,
        estimatedImpact: entry.estimatedImpact,
        supportsDryRun: entry.supportsDryRun,
        requiresConfirmation: entry.requiresConfirmation,
        hasHealthCheck: typeof entry.healthCheck === "function",
        health,
        environment,
        alreadyApplied: !entry.idempotent && Boolean(lastSuccess),
        lastExecution,
        lastSuccess,
        previousExecutions,
      },
    });
  } catch (error) {
    next(error);
  }
};
