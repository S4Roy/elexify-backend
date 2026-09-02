import { listOperations } from "../../../scripts/seeders/registry/index.js";
import { currentEnvironment } from "../../../scripts/runner.js";
import { normalizeHealth } from "../../../scripts/shared/health.js";
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

    // Health is computed inline (parallel, only for entries that declare a
    // real healthCheck) so the list screen's "Current Health" column is a
    // single round trip — cheap since these are simple count queries, not
    // a per-row waterfall of separate /health calls from the client.
    const healthByKey = new Map(
      await Promise.all(
        entries.map(async (entry) => {
          if (typeof entry.healthCheck !== "function") return [entry.key, { status: "NOT_APPLICABLE" }];
          try {
            return [entry.key, normalizeHealth(await entry.healthCheck({ environment }))];
          } catch (e) {
            return [entry.key, { status: "ERROR", detail: e.message }];
          }
        }),
      ),
    );

    const data = entries.map((entry) => {
      const last = lastByKey.get(entry.key);
      return {
        ...toSafeView(entry),
        allowedInCurrentEnvironment: entry.allowedEnvironments.includes(environment),
        health: healthByKey.get(entry.key) ?? { status: "NOT_APPLICABLE" },
        lastExecution: last
          ? {
              execution_id: String(last._id),
              status: last.status,
              dry_run: last.dry_run,
              completed_at: last.completed_at,
            }
          : null,
      };
    });

    res.status(200).json({ status: "success", message: req.__("Data operations listed"), data: { environment, operations: data } });
  } catch (error) {
    next(error);
  }
};
