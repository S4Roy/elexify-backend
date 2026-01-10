import { Router } from "express";

import { orderRouter } from "./order.js";

const webhookRouter = Router();

webhookRouter.use("/order", orderRouter);

export { webhookRouter };
