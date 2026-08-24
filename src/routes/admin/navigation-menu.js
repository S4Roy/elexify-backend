import { Router } from "express";
import { navigationMenuController } from "../../controllers/admin/index.js";
import { navigationMenuValidation } from "../../validations/admin/index.js";
import { navigationMenuItemRouter } from "./navigation-menu-item.js";

const navigationMenuRouter = Router();

// Literal route before the ":id"-param routes below.
navigationMenuRouter.post(
  "/generate-defaults",
  navigationMenuController.generateDefaults
);
navigationMenuRouter.get("/list", navigationMenuController.list);
navigationMenuRouter.post(
  "/add",
  navigationMenuValidation.add,
  navigationMenuController.add
);
navigationMenuRouter.put(
  "/edit",
  navigationMenuValidation.edit,
  navigationMenuController.edit
);
navigationMenuRouter.delete(
  "/delete",
  navigationMenuValidation.remove,
  navigationMenuController.remove
);
navigationMenuRouter.post("/:id/publish", navigationMenuController.publish);
navigationMenuRouter.post(
  "/:id/unpublish",
  navigationMenuController.unpublish
);
navigationMenuRouter.get("/:id/preview", navigationMenuController.preview);

navigationMenuRouter.use("/:menuId/items", navigationMenuItemRouter);

export { navigationMenuRouter };
