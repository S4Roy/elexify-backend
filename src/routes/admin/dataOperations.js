import { Router } from "express";
import { dataOperationsController } from "../../controllers/admin/index.js";
import { requireOperationPermission, requireDataView, requireOperationHistoryView } from "../../middleware/requireOperationPermission.js";

const dataOperationsRouter = Router();

// Execution history — checked before "/:key*" routes so "/executions"
// isn't swallowed by the :key param.
dataOperationsRouter.get(
  "/executions",
  requireOperationHistoryView,
  dataOperationsController.listExecutions,
);

dataOperationsRouter.get(
  "/executions/:id",
  requireOperationHistoryView,
  dataOperationsController.executionDetails,
);

dataOperationsRouter.get(
  "/executions/:id/logs",
  requireOperationHistoryView,
  dataOperationsController.executionLogs,
);

dataOperationsRouter.get(
  "/",
  requireDataView,
  dataOperationsController.list,
);

dataOperationsRouter.get(
  "/:key",
  requireOperationPermission("view"),
  dataOperationsController.details,
);

dataOperationsRouter.get(
  "/:key/health",
  requireOperationPermission("view"),
  dataOperationsController.health,
);

dataOperationsRouter.post(
  "/:key/dry-run",
  requireOperationPermission("execute"),
  dataOperationsController.dryRun,
);

dataOperationsRouter.post(
  "/:key/run",
  requireOperationPermission("execute"),
  dataOperationsController.run,
);

export { dataOperationsRouter };
