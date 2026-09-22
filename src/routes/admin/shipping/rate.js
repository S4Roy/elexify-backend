import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { shippingRateController } from "../../../controllers/admin/index.js";
import { shippingRateValidation } from "../../../validations/admin/index.js";

const shippingRateRouter = Router();

shippingRateRouter.get("/list", requirePermission("shipping_rates.view"), shippingRateValidation.list, shippingRateController.list);
shippingRateRouter.post("/add", requirePermission("shipping_rates.create"), shippingRateValidation.add, shippingRateController.add);
shippingRateRouter.put("/edit", requirePermission("shipping_rates.update"), shippingRateValidation.edit, shippingRateController.edit);
shippingRateRouter.delete("/delete", requirePermission("shipping_rates.delete"), shippingRateValidation.remove, shippingRateController.remove);

export { shippingRateRouter };
