import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const classificationRouter = Router();

classificationRouter.get(
  "/list", requirePermission("classification.view"),
  inventoryValidation.classificationValidation.list,
  inventoryController.classificationController.list
);

classificationRouter.get(
  "/details/:slug", requirePermission("classification.view"),
  inventoryValidation.classificationValidation.details,
  inventoryController.classificationController.list
);

classificationRouter.post(
  "/add", requirePermission("classification.create"),
  inventoryValidation.classificationValidation.add,
  inventoryController.classificationController.add
);

classificationRouter.put(
  "/edit", requirePermission("classification.update"),
  inventoryValidation.classificationValidation.edit,
  inventoryController.classificationController.edit
);

classificationRouter.delete(
  "/delete", requirePermission("classification.delete"),
  inventoryValidation.classificationValidation.remove,
  inventoryController.classificationController.remove
);

export { classificationRouter };
