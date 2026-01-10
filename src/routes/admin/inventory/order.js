import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";

const orderRouter = Router();

orderRouter.get(
  "/list",
  inventoryValidation.orderValidation.list,
  inventoryController.orderController.list
);
orderRouter.post("/shipping", inventoryController.orderController.shipping);

orderRouter.get(
  "/details",
  // inventoryValidation.orderValidation.list,
  inventoryController.orderController.order_details
);
orderRouter.post(
  "/place",
  inventoryValidation.orderValidation.place,
  inventoryController.orderController.add
);
orderRouter.get("/stats", inventoryController.orderController.stats);

export { orderRouter };
