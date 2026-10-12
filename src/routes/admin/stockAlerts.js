import { Router } from "express";
import * as stockAlertsController from "../../controllers/admin/stockAlerts.js";
import { requirePermission } from "../../middleware/requirePermission.js";

const stockAlertsRouter = Router();
const view = requirePermission("products.view");

stockAlertsRouter.get("/low-stock", view, stockAlertsController.lowStock);
stockAlertsRouter.get("/requests", view, stockAlertsController.requests);
stockAlertsRouter.get("/requests/subscribers", view, stockAlertsController.subscribers);
stockAlertsRouter.get("/settings", view, stockAlertsController.getSettingsHandler);
stockAlertsRouter.put("/settings", requirePermission("settings.update"), stockAlertsController.updateSettings);

export { stockAlertsRouter };
