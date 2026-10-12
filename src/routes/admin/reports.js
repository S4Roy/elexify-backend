import { Router } from "express";
import * as reportsController from "../../controllers/admin/reports.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const reportsRouter = Router();

reportsRouter.get("/", requirePermission("orders.view"), reportsController.list);
reportsRouter.get("/:type/export", requirePermission("orders.export"), reportsController.exportReport);
reportsRouter.get("/:type", requirePermission("orders.view"), reportsController.show);

export { reportsRouter };
