import { Router } from "express";
import { cityController } from "../../controllers/admin/index.js";
import { cityValidation } from "../../validations/admin/index.js";

const cityRouter = Router();

cityRouter.get("/list", cityValidation.list, cityController.list);
cityRouter.put("/edit", cityValidation.edit, cityController.edit);

export { cityRouter };
