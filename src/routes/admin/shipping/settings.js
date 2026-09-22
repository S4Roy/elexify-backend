import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { shippingSettingsController } from "../../../controllers/admin/index.js";
import { shippingSettingsValidation } from "../../../validations/admin/index.js";

const shippingSettingsRouter = Router();

shippingSettingsRouter.get("/", requirePermission("shipping.view"), shippingSettingsController.get);
shippingSettingsRouter.put("/edit", requirePermission("shipping.update"), shippingSettingsValidation.edit, shippingSettingsController.edit);

export { shippingSettingsRouter };
