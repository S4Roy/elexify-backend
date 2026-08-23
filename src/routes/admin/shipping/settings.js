import { Router } from "express";
import { shippingSettingsController } from "../../../controllers/admin/index.js";
import { shippingSettingsValidation } from "../../../validations/admin/index.js";

const shippingSettingsRouter = Router();

shippingSettingsRouter.get("/", shippingSettingsController.get);
shippingSettingsRouter.put("/edit", shippingSettingsValidation.edit, shippingSettingsController.edit);

export { shippingSettingsRouter };
