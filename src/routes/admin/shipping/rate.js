import { Router } from "express";
import { shippingRateController } from "../../../controllers/admin/index.js";
import { shippingRateValidation } from "../../../validations/admin/index.js";

const shippingRateRouter = Router();

shippingRateRouter.get("/list", shippingRateValidation.list, shippingRateController.list);
shippingRateRouter.post("/add", shippingRateValidation.add, shippingRateController.add);
shippingRateRouter.put("/edit", shippingRateValidation.edit, shippingRateController.edit);
shippingRateRouter.delete("/delete", shippingRateValidation.remove, shippingRateController.remove);

export { shippingRateRouter };
