import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { settingsController } from "../../controllers/admin/index.js";
import { settingsValidation } from "../../validations/admin/index.js";

const settingsRouter = Router();

settingsRouter.get("/", requirePermission("settings.view"), settingsController.list);
settingsRouter.put("/edit", requirePermission("settings.update"), settingsValidation.edit, settingsController.edit);

export { settingsRouter };
