import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { countryController } from "../../controllers/admin/index.js";
import { countryValidation } from "../../validations/admin/index.js";

const countryRouter = Router();

countryRouter.get("/list", requirePermission("countries.view"), countryValidation.list, countryController.list);
countryRouter.put("/edit", requirePermission("countries.update"), countryValidation.edit, countryController.edit);

export { countryRouter };
