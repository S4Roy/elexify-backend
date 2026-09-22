import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { cityController } from "../../controllers/admin/index.js";
import { cityValidation } from "../../validations/admin/index.js";

const cityRouter = Router();

cityRouter.get("/list", requirePermission("cities.view"), cityValidation.list, cityController.list);
cityRouter.put("/edit", requirePermission("cities.update"), cityValidation.edit, cityController.edit);

export { cityRouter };
