import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const tagRouter = Router();

tagRouter.get(
  "/list",
  inventoryValidation.tagValidation.list,
  inventoryController.tagController.list
);

tagRouter.get(
  "/details/:slug",
  inventoryValidation.tagValidation.details,
  inventoryController.tagController.list
);

tagRouter.post(
  "/add",
  inventoryValidation.tagValidation.add,
  inventoryController.tagController.add
);

tagRouter.put(
  "/edit",
  inventoryValidation.tagValidation.edit,
  inventoryController.tagController.edit
);

tagRouter.delete(
  "/delete",
  inventoryValidation.tagValidation.remove,
  inventoryController.tagController.remove
);

export { tagRouter };
