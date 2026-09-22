import { requirePermission } from "../../../middleware/requirePermission.js";
import { celebrate, Joi } from "celebrate";
import { productListQuery } from "../../../validations/admin/inventory/product/list.js";
import { exportProducts } from "../../../controllers/admin/inventory/product/exportProducts.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const productRouter = Router();

productRouter.get("/export", requirePermission("products.export"), celebrate({ query: productListQuery.keys({
  product_ids: Joi.string().pattern(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/).max(25000),
}) }), exportProducts);

productRouter.get(
  "/list", requirePermission("products.view"),
  inventoryValidation.productValidation.list,
  inventoryController.productController.list
);

productRouter.get(
  "/details/:slug", requirePermission("products.view"),
  inventoryValidation.productValidation.details,
  inventoryController.productController.list
);

productRouter.post(
  "/add", requirePermission("products.create"),
  inventoryValidation.productValidation.add,
  inventoryController.productController.add
);

productRouter.put(
  "/edit", requirePermission("products.update"),
  inventoryValidation.productValidation.edit,
  inventoryController.productController.edit
);
productRouter.put(
  "/update-status", requirePermission("products.update"),
  inventoryValidation.productValidation.updateStatus,
  inventoryController.productController.updateStatus
);

productRouter.delete(
  "/delete", requirePermission("products.delete"),
  inventoryValidation.productValidation.remove,
  inventoryController.productController.remove
);
productRouter.delete(
  "/variation/delete", requirePermission("products.delete"),
  inventoryValidation.productValidation.remove,
  inventoryController.productController.removeVariation
);
productRouter.post(
  "/import", requirePermission("products.import"),
  inventoryController.productController.importItems
);
productRouter.get("/stats", requirePermission("products.view"), inventoryController.productController.stats);
productRouter.get(
  "/specifications", requirePermission("products.view"),
  inventoryController.productController.specifications
);

export { productRouter };
