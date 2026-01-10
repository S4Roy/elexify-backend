import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const stockRouter = Router();

stockRouter.get(
  "/transactions",
  inventoryValidation.stockValidation.list,
  inventoryController.stockController.list
);

stockRouter.get(
  "/details/:slug",
  inventoryValidation.stockValidation.details,
  inventoryController.stockController.list
);

stockRouter.post(
  "/add",
  inventoryValidation.stockValidation.add,
  inventoryController.stockController.add
);

stockRouter.put(
  "/edit",
  inventoryValidation.stockValidation.edit,
  inventoryController.stockController.edit
);

stockRouter.delete(
  "/delete",
  inventoryValidation.stockValidation.remove,
  inventoryController.stockController.remove
);

export { stockRouter };
