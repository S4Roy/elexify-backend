import { StatusError } from "../../../config/index.js";
import { getOperation } from "../../../scripts/seeders/registry/index.js";
import { currentEnvironment } from "../../../scripts/runner.js";
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
        environment,
        alreadyApplied: !entry.idempotent && Boolean(lastSuccess),
        lastExecution,
        lastSuccess,
      },
    });
  } catch (error) {
    next(error);
  }
};
