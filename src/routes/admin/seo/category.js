import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { seoCategoryController } from "../../../controllers/admin/index.js";
import { seoCategoryValidation } from "../../../validations/admin/index.js";

const seoCategoryRouter = Router();

seoCategoryRouter.get("/:category_id", requirePermission("seo.view"), seoCategoryValidation.get, seoCategoryController.get);
seoCategoryRouter.put("/:category_id", requirePermission("seo.update"), seoCategoryValidation.update, seoCategoryController.update);

export { seoCategoryRouter };
