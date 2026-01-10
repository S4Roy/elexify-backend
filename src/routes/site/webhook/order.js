import { Router } from "express";
import { webhookController } from "../../../controllers/site/index.js";

const orderRouter = Router();

orderRouter.post("/update-status", webhookController.updateOrderStatus);

export { orderRouter };
