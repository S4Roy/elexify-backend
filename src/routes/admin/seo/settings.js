import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { seoSettingsController } from "../../../controllers/admin/index.js";
import { seoSettingsValidation } from "../../../validations/admin/index.js";

const seoSettingsRouter = Router();

seoSettingsRouter.get("/", requirePermission("seo.view"), seoSettingsController.get);
seoSettingsRouter.put("/", requirePermission("seo.update"), seoSettingsValidation.edit, seoSettingsController.edit);

export { seoSettingsRouter };
