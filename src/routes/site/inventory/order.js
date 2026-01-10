import { Router } from "express";
import { inventoryController } from "../../../controllers/site/index.js";
import { inventoryValidation } from "../../../validations/site/index.js";

const orderRouter = Router();

orderRouter.get(
  "/list",
  inventoryValidation.orderValidation.list,
  inventoryController.orderController.list
);

orderRouter.post(
  "/place",
  inventoryValidation.orderValidation.place,
  inventoryController.orderController.add
);
orderRouter.post(
  "/verify-payment",
  // inventoryValidation.orderValidation.place,
  inventoryController.orderController.verifyPayment
);

export { orderRouter };
