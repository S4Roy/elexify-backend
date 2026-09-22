import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const brandRouter = Router();

brandRouter.get(
  "/list", requirePermission("brands.view"),
  inventoryValidation.brandValidation.list,
  inventoryController.brandController.list
);

brandRouter.get(
  "/details/:slug", requirePermission("brands.view"),
  inventoryValidation.brandValidation.details,
  inventoryController.brandController.list
);

brandRouter.post(
  "/add", requirePermission("brands.create"),
  inventoryValidation.brandValidation.add,
  inventoryController.brandController.add
);

brandRouter.put(
  "/edit", requirePermission("brands.update"),
  inventoryValidation.brandValidation.edit,
  inventoryController.brandController.edit
);

brandRouter.delete(
  "/delete", requirePermission("brands.delete"),
  inventoryValidation.brandValidation.remove,
  inventoryController.brandController.remove
);

export { brandRouter };
