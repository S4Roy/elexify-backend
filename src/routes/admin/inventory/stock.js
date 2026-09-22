import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const stockRouter = Router();

stockRouter.get(
  "/transactions", requirePermission("inventory.view"),
  inventoryValidation.stockValidation.list,
  inventoryController.stockController.list
);

stockRouter.get(
  "/details/:slug", requirePermission("inventory.view"),
  inventoryValidation.stockValidation.details,
  inventoryController.stockController.list
);

stockRouter.post(
  "/add", requirePermission("inventory.adjust"),
  inventoryValidation.stockValidation.add,
  inventoryController.stockController.add
);

stockRouter.put(
  "/edit", requirePermission("inventory.adjust"),
  inventoryValidation.stockValidation.edit,
  inventoryController.stockController.edit
);

stockRouter.delete(
  "/delete", requirePermission("inventory.adjust"),
  inventoryValidation.stockValidation.remove,
  inventoryController.stockController.remove
);

export { stockRouter };
