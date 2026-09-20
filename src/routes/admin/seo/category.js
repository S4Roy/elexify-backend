import { Router } from "express";
import { seoCategoryController } from "../../../controllers/admin/index.js";
import { seoCategoryValidation } from "../../../validations/admin/index.js";

const seoCategoryRouter = Router();

seoCategoryRouter.get("/:category_id", seoCategoryValidation.get, seoCategoryController.get);
seoCategoryRouter.put("/:category_id", seoCategoryValidation.update, seoCategoryController.update);

export { seoCategoryRouter };
