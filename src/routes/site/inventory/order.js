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
  inventoryValidation.orderValidation.verifyPayment,
  inventoryController.orderController.verifyPayment
);
orderRouter.post(
  "/cancel",
  inventoryValidation.orderValidation.cancel,
  inventoryController.orderController.cancel
);
orderRouter.get("/invoice", inventoryController.orderController.invoice);

export { orderRouter };
