import { StatusError } from "../../../config/index.js";
import SystemOperationExecution from "../../../models/SystemOperationExecution.js";
import SystemOperationLog from "../../../models/SystemOperationLog.js";

// GET /admin/data-operations/executions — paginated, filterable by
// operation_key/status/environment.
export const listExecutions = async (req, res, next) => {
  try {
    const { key, status, environment, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (key) filter.operation_key = key;
    if (status) filter.status = status;
    if (environment) filter.environment = environment;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25));

    const [items, total] = await Promise.all([
      SystemOperationExecution.find(filter)
        .sort({ created_at: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      SystemOperationExecution.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      message: req.__("Executions listed"),
      data: { items, total, page: pageNum, limit: limitNum },
    });
  } catch (error) {
    next(error);
  }
};

// GET /admin/data-operations/executions/:id
export const executionDetails = async (req, res, next) => {
  try {
    const execution = await SystemOperationExecution.findById(req.params.id).lean();
    if (!execution) throw StatusError.notFound(req.__("Execution not found"));
    res.status(200).json({ status: "success", message: req.__("Execution detail"), data: execution });
  } catch (error) {
    next(error);
  }
};

// GET /admin/data-operations/executions/:id/logs
export const executionLogs = async (req, res, next) => {
  try {
    const execution = await SystemOperationExecution.findById(req.params.id).select("_id").lean();
    if (!execution) throw StatusError.notFound(req.__("Execution not found"));

    const logs = await SystemOperationLog.find({ execution_id: req.params.id }).sort({ timestamp: 1 }).lean();
    res.status(200).json({ status: "success", message: req.__("Execution logs"), data: { executionId: req.params.id, logs } });
  } catch (error) {
    next(error);
  }
};
