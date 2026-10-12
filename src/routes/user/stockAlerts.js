import { Router } from "express";
import * as stockAlertController from "../../controllers/user/stockAlert/index.js";

const stockAlertsRouter = Router();

stockAlertsRouter.get("/", stockAlertController.list);
stockAlertsRouter.post("/", stockAlertController.subscribe);
stockAlertsRouter.delete("/", stockAlertController.unsubscribe);

export { stockAlertsRouter };
