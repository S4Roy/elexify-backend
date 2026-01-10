import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const couponRouter = Router();

couponRouter.get(
  "/list",
  inventoryValidation.couponValidation.list,
  inventoryController.couponController.list
);

couponRouter.get(
  "/details/:slug",
  inventoryValidation.couponValidation.details,
  inventoryController.couponController.list
);

couponRouter.post(
  "/add",
  inventoryValidation.couponValidation.add,
  inventoryController.couponController.add
);

couponRouter.put(
  "/edit",
  inventoryValidation.couponValidation.edit,
  inventoryController.couponController.edit
);

couponRouter.delete(
  "/delete",
  inventoryValidation.couponValidation.remove,
  inventoryController.couponController.remove
);

export { couponRouter };
