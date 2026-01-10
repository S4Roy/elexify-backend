import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const categoryRouter = Router();

categoryRouter.get(
  "/list",
  inventoryValidation.categoryValidation.list,
  inventoryController.categoryController.list
);

categoryRouter.get(
  "/details/:slug",
  inventoryValidation.categoryValidation.details,
  inventoryController.categoryController.list
);

categoryRouter.post(
  "/add",
  inventoryValidation.categoryValidation.add,
  inventoryController.categoryController.add
);

categoryRouter.put(
  "/edit",
  inventoryValidation.categoryValidation.edit,
  inventoryController.categoryController.edit
);

categoryRouter.delete(
  "/delete",
  inventoryValidation.categoryValidation.remove,
  inventoryController.categoryController.remove
);
categoryRouter.put(
  "/order",
  inventoryValidation.categoryValidation.order,
  inventoryController.categoryController.order
);

export { categoryRouter };
