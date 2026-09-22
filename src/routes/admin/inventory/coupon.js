import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const couponRouter = Router();

couponRouter.get("/usage", requirePermission("discounts.view"), inventoryValidation.couponValidation.usage, inventoryController.couponController.usage);

couponRouter.get(
  "/list", requirePermission("discounts.view"),
  inventoryValidation.couponValidation.list,
  inventoryController.couponController.list
);

couponRouter.get(
  "/details/:slug", requirePermission("discounts.view"),
  inventoryValidation.couponValidation.details,
  inventoryController.couponController.list
);

couponRouter.post(
  "/add", requirePermission("discounts.create"),
  inventoryValidation.couponValidation.add,
  inventoryController.couponController.add
);

couponRouter.put(
  "/edit", requirePermission("discounts.update"),
  inventoryValidation.couponValidation.edit,
  inventoryController.couponController.edit
);

couponRouter.delete(
  "/delete", requirePermission("discounts.delete"),
  inventoryValidation.couponValidation.remove,
  inventoryController.couponController.remove
);

export { couponRouter };
