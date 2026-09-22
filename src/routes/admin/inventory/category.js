import { requirePermission } from "../../../middleware/requirePermission.js";
import { celebrate, Joi } from 'celebrate';
import { categoryListQuery } from '../../../validations/admin/inventory/category/list.js';
import { exportCategories } from '../../../controllers/admin/inventory/category/exportCategories.js';
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const categoryRouter = Router();
categoryRouter.get('/export', requirePermission("categories.export"), celebrate({ query: categoryListQuery.keys({
  category_ids: Joi.string().pattern(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/).max(25000),
}) }), exportCategories);

categoryRouter.get(
  "/list", requirePermission("categories.view"),
  inventoryValidation.categoryValidation.list,
  inventoryController.categoryController.list
);

categoryRouter.get(
  "/details/:slug", requirePermission("categories.view"),
  inventoryValidation.categoryValidation.details,
  inventoryController.categoryController.list
);

categoryRouter.post(
  "/add", requirePermission("categories.create"),
  inventoryValidation.categoryValidation.add,
  inventoryController.categoryController.add
);

categoryRouter.put(
  "/edit", requirePermission("categories.update"),
  inventoryValidation.categoryValidation.edit,
  inventoryController.categoryController.edit
);

categoryRouter.delete(
  "/delete", requirePermission("categories.delete"),
  inventoryValidation.categoryValidation.remove,
  inventoryController.categoryController.remove
);
categoryRouter.put(
  "/order", requirePermission("categories.update"),
  inventoryValidation.categoryValidation.order,
  inventoryController.categoryController.order
);

export { categoryRouter };
