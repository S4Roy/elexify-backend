import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const tagRouter = Router();

tagRouter.get(
  "/list", requirePermission("tags.view"),
  inventoryValidation.tagValidation.list,
  inventoryController.tagController.list
);

tagRouter.get(
  "/details/:slug", requirePermission("tags.view"),
  inventoryValidation.tagValidation.details,
  inventoryController.tagController.list
);

tagRouter.post(
  "/add", requirePermission("tags.create"),
  inventoryValidation.tagValidation.add,
  inventoryController.tagController.add
);

tagRouter.put(
  "/edit", requirePermission("tags.update"),
  inventoryValidation.tagValidation.edit,
  inventoryController.tagController.edit
);

tagRouter.delete(
  "/delete", requirePermission("tags.delete"),
  inventoryValidation.tagValidation.remove,
  inventoryController.tagController.remove
);

export { tagRouter };
