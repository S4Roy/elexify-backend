import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const brandRouter = Router();

brandRouter.get(
  "/list",
  inventoryValidation.brandValidation.list,
  inventoryController.brandController.list
);

brandRouter.get(
  "/details/:slug",
  inventoryValidation.brandValidation.details,
  inventoryController.brandController.list
);

brandRouter.post(
  "/add",
  inventoryValidation.brandValidation.add,
  inventoryController.brandController.add
);

brandRouter.put(
  "/edit",
  inventoryValidation.brandValidation.edit,
  inventoryController.brandController.edit
);

brandRouter.delete(
  "/delete",
  inventoryValidation.brandValidation.remove,
  inventoryController.brandController.remove
);

export { brandRouter };
