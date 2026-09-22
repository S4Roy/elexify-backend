import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const attributeRouter = Router();

attributeRouter.get(
  "/list", requirePermission("attributes.view"),
  inventoryValidation.attributeValidation.list,
  inventoryController.attributeController.list
);
attributeRouter.get(
  "/value-list", requirePermission("attributes.view"),
  inventoryValidation.attributeValidation.value_list,
  inventoryController.attributeController.value_list
);

// attributeRouter.get(
//   "/details/:slug",
//   inventoryValidation.attributeValidation.details,
//   inventoryController.attributeController.details
// );

attributeRouter.post(
  "/add", requirePermission("attributes.create"),
  inventoryValidation.attributeValidation.add,
  inventoryController.attributeController.add
);

attributeRouter.put(
  "/edit", requirePermission("attributes.update"),
  inventoryValidation.attributeValidation.edit,
  inventoryController.attributeController.edit
);

attributeRouter.delete(
  "/delete", requirePermission("attributes.delete"),
  inventoryValidation.attributeValidation.remove,
  inventoryController.attributeController.remove
);

export { attributeRouter };
