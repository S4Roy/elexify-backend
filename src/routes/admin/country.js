import { Router } from "express";
import { countryController } from "../../controllers/admin/index.js";
import { countryValidation } from "../../validations/admin/index.js";

const countryRouter = Router();

countryRouter.get("/list", countryValidation.list, countryController.list);
countryRouter.put("/edit", countryValidation.edit, countryController.edit);

export { countryRouter };
