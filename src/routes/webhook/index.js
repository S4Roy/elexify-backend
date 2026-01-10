import { Router } from "express";
import { inventoryRouter } from "./inventory/index.js";

const v1WebhookRouter = Router();
// All routes go here

v1WebhookRouter.use("/inventory", inventoryRouter);

export { v1WebhookRouter };
