import { listOperations } from "../../../scripts/seeders/registry/index.js";
import { currentEnvironment } from "../../../scripts/runner.js";
import SystemOperationExecution from "../../../models/SystemOperationExecution.js";

// Safe, serializable view of a registry entry — never exposes the
// handler/healthCheck functions themselves (they're not data, and
// functions don't serialize meaningfully to JSON anyway).
const toSafeView = (entry) => ({
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
  dependencies: entry.dependencies,
  estimatedImpact: entry.estimatedImpact,
  supportsDryRun: entry.supportsDryRun,
  requiresConfirmation: entry.requiresConfirmation,
  hasHealthCheck: typeof entry.healthCheck === "function",
});

export const list = async (req, res, next) => {
  try {
    const environment = currentEnvironment();
    const entries = listOperations();

    const lastExecutions = await SystemOperationExecution.aggregate([
      { $match: { operation_key: { $in: entries.map((e) => e.key) }, environment } },
      { $sort: { created_at: -1 } },
      { $group: { _id: "$operation_key", lastExecution: { $first: "$$ROOT" } } },
    ]);
    const lastByKey = new Map(lastExecutions.map((row) => [row._id, row.lastExecution]));

    const data = entries.map((entry) => ({
      ...toSafeView(entry),
      allowedInCurrentEnvironment: entry.allowedEnvironments.includes(environment),
      lastExecution: lastByKey.has(entry.key)
        ? {
            id: String(lastByKey.get(entry.key)._id),
            status: lastByKey.get(entry.key).status,
            dryRun: lastByKey.get(entry.key).dry_run,
            completedAt: lastByKey.get(entry.key).completed_at,
          }
        : null,
    }));

    res.status(200).json({ status: "success", message: req.__("Data operations listed"), data: { environment, operations: data } });
  } catch (error) {
    next(error);
  }
};
