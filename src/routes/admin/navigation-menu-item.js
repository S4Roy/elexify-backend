import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { navigationMenuItemController } from "../../controllers/admin/index.js";
import { navigationMenuItemValidation } from "../../validations/admin/index.js";

const navigationMenuItemRouter = Router({ mergeParams: true });

navigationMenuItemRouter.get("/", requirePermission("navigation.view"), navigationMenuItemController.list);
navigationMenuItemRouter.post(
  "/", requirePermission("navigation.create"),
  navigationMenuItemValidation.add,
  navigationMenuItemController.add
);
navigationMenuItemRouter.post(
  "/reorder", requirePermission("navigation.update"),
  navigationMenuItemValidation.reorder,
  navigationMenuItemController.reorder
);
navigationMenuItemRouter.put(
  "/:id", requirePermission("navigation.update"),
  navigationMenuItemValidation.edit,
  navigationMenuItemController.edit
);
navigationMenuItemRouter.delete(
  "/:id", requirePermission("navigation.delete"),
  navigationMenuItemValidation.remove,
  navigationMenuItemController.remove
);

export { navigationMenuItemRouter };
