import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const attributeRouter = Router();

attributeRouter.get(
  "/list",
  inventoryValidation.attributeValidation.list,
  inventoryController.attributeController.list
);
attributeRouter.get(
  "/value-list",
  inventoryValidation.attributeValidation.value_list,
  inventoryController.attributeController.value_list
);

// attributeRouter.get(
//   "/details/:slug",
//   inventoryValidation.attributeValidation.details,
//   inventoryController.attributeController.details
// );

attributeRouter.post(
  "/add",
  inventoryValidation.attributeValidation.add,
  inventoryController.attributeController.add
);

attributeRouter.put(
  "/edit",
  inventoryValidation.attributeValidation.edit,
  inventoryController.attributeController.edit
);

attributeRouter.delete(
  "/delete",
  inventoryValidation.attributeValidation.remove,
  inventoryController.attributeController.remove
);

export { attributeRouter };
