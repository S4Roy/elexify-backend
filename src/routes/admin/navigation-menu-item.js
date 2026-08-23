import { Router } from "express";
import { navigationMenuItemController } from "../../controllers/admin/index.js";
import { navigationMenuItemValidation } from "../../validations/admin/index.js";

const navigationMenuItemRouter = Router({ mergeParams: true });

navigationMenuItemRouter.get("/", navigationMenuItemController.list);
navigationMenuItemRouter.post(
  "/",
  navigationMenuItemValidation.add,
  navigationMenuItemController.add
);
navigationMenuItemRouter.post(
  "/reorder",
  navigationMenuItemValidation.reorder,
  navigationMenuItemController.reorder
);
navigationMenuItemRouter.put(
  "/:id",
  navigationMenuItemValidation.edit,
  navigationMenuItemController.edit
);
navigationMenuItemRouter.delete(
  "/:id",
  navigationMenuItemValidation.remove,
  navigationMenuItemController.remove
);

export { navigationMenuItemRouter };
