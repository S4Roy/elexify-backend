import { Router } from "express";
import { seoSettingsController } from "../../../controllers/admin/index.js";
import { seoSettingsValidation } from "../../../validations/admin/index.js";

const seoSettingsRouter = Router();

seoSettingsRouter.get("/", seoSettingsController.get);
seoSettingsRouter.put("/", seoSettingsValidation.edit, seoSettingsController.edit);

export { seoSettingsRouter };
