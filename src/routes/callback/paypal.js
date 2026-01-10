import { Router } from "express";
import { paypalController } from "../../controllers/callback/index.js";

const paypalRouter = Router();

paypalRouter.get("/:status", paypalController.verifyPayment);

export { paypalRouter };
