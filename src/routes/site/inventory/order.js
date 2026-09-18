import { validateAccessToken } from "../../../middleware/accessToken.js";
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
orderRouter.post("/retry-payment", validateAccessToken, inventoryController.orderController.retryPayment);
orderRouter.post(
  "/cancel",
  inventoryValidation.orderValidation.cancel,
  inventoryController.orderController.cancel
);
orderRouter.get("/invoice", inventoryController.orderController.invoice);
orderRouter.post(
  "/return",
  validateAccessToken,
  inventoryValidation.orderValidation.createReturn,
  inventoryController.orderController.createReturn,
);
orderRouter.get("/returns", validateAccessToken, inventoryController.orderController.listReturns);

export { orderRouter };
