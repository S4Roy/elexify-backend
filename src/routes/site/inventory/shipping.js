import { Router } from "express";
import { shippingController } from "../../../controllers/site/inventory/index.js";
import { shippingValidation } from "../../../validations/site/inventory/index.js";

const shippingRouter = Router();

shippingRouter.post("/estimate", shippingValidation.estimate, shippingController.estimate);

export { shippingRouter };
