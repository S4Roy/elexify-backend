import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const classificationRouter = Router();

classificationRouter.get(
  "/list",
  inventoryValidation.classificationValidation.list,
  inventoryController.classificationController.list
);

classificationRouter.get(
  "/details/:slug",
  inventoryValidation.classificationValidation.details,
  inventoryController.classificationController.list
);

classificationRouter.post(
  "/add",
  inventoryValidation.classificationValidation.add,
  inventoryController.classificationController.add
);

classificationRouter.put(
  "/edit",
  inventoryValidation.classificationValidation.edit,
  inventoryController.classificationController.edit
);

classificationRouter.delete(
  "/delete",
  inventoryValidation.classificationValidation.remove,
  inventoryController.classificationController.remove
);

export { classificationRouter };
