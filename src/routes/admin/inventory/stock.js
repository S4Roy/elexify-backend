import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const stockRouter = Router();

// Ledger of on-hand movements.
stockRouter.get(
  "/transactions", requirePermission("inventory.view"),
  inventoryValidation.stockValidation.list,
  inventoryController.stockController.list
);

// On-hand / reserved / available per SKU.
stockRouter.get(
  "/levels", requirePermission("inventory.view"),
  inventoryValidation.stockValidation.levels,
  inventoryController.stockController.levels
);

// Manual adjustments with reason codes. The only way admins change stock.
stockRouter.post(
  "/adjust", requirePermission("inventory.adjust"),
  inventoryValidation.stockValidation.adjust,
  inventoryController.stockController.adjust
);

stockRouter.post(
  "/adjust/bulk", requirePermission("inventory.adjust"),
  inventoryValidation.stockValidation.bulkAdjust,
  inventoryController.stockController.bulkAdjust
);

export { stockRouter };
