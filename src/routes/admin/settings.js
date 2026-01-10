import { Router } from "express";
import { settingsController } from "../../controllers/admin/index.js";
import { settingsValidation } from "../../validations/admin/index.js";

const settingsRouter = Router();

settingsRouter.get("/", settingsController.list);
settingsRouter.put("/edit", settingsValidation.edit, settingsController.edit);

export { settingsRouter };
