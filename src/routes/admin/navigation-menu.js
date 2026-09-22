import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { navigationMenuController } from "../../controllers/admin/index.js";
import { navigationMenuValidation } from "../../validations/admin/index.js";
import { navigationMenuItemRouter } from "./navigation-menu-item.js";

const navigationMenuRouter = Router();

// Literal route before the ":id"-param routes below.
navigationMenuRouter.post(
  "/generate-defaults", requirePermission("navigation.update"),
  navigationMenuController.generateDefaults
);
navigationMenuRouter.get("/list", requirePermission("navigation.view"), navigationMenuController.list);
navigationMenuRouter.post(
  "/add", requirePermission("navigation.create"),
  navigationMenuValidation.add,
  navigationMenuController.add
);
navigationMenuRouter.put(
  "/edit", requirePermission("navigation.update"),
  navigationMenuValidation.edit,
  navigationMenuController.edit
);
navigationMenuRouter.delete(
  "/delete", requirePermission("navigation.delete"),
  navigationMenuValidation.remove,
  navigationMenuController.remove
);
navigationMenuRouter.post("/:id/publish", requirePermission("navigation.update"), navigationMenuController.publish);
navigationMenuRouter.post(
  "/:id/unpublish", requirePermission("navigation.update"),
  navigationMenuController.unpublish
);
navigationMenuRouter.get("/:id/preview", requirePermission("navigation.view"), navigationMenuController.preview);

navigationMenuRouter.use("/:menuId/items", navigationMenuItemRouter);

export { navigationMenuRouter };
