import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const productRouter = Router();

productRouter.get(
  "/list",
  inventoryValidation.productValidation.list,
  inventoryController.productController.list
);

productRouter.get(
  "/details/:slug",
  inventoryValidation.productValidation.details,
  inventoryController.productController.list
);

productRouter.post(
  "/add",
  inventoryValidation.productValidation.add,
  inventoryController.productController.add
);

productRouter.put(
  "/edit",
  inventoryValidation.productValidation.edit,
  inventoryController.productController.edit
);
productRouter.put(
  "/update-status",
  inventoryValidation.productValidation.updateStatus,
  inventoryController.productController.updateStatus
);

productRouter.delete(
  "/delete",
  inventoryValidation.productValidation.remove,
  inventoryController.productController.remove
);
productRouter.delete(
  "/variation/delete",
  inventoryValidation.productValidation.remove,
  inventoryController.productController.removeVariation
);
productRouter.post(
  "/import",
  inventoryController.productController.importItems
);
productRouter.get("/stats", inventoryController.productController.stats);
productRouter.get(
  "/specifications",
  inventoryController.productController.specifications
);

export { productRouter };
