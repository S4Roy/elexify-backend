import { requireRecaptcha } from "../../../middleware/recaptcha.js";
import { validateAccessToken } from "../../../middleware/accessToken.js";
import { Router } from "express";
import { trackOrderRateLimiter } from "../../../middleware/rateLimiter.js";
import { inventoryController } from "../../../controllers/site/index.js";
import { inventoryValidation } from "../../../validations/site/index.js";

const orderRouter = Router();

orderRouter.get(
  "/list",
  inventoryValidation.orderValidation.list,
  inventoryController.orderController.list
);

orderRouter.post(
  "/place", requireRecaptcha("checkout"),
  inventoryValidation.orderValidation.place,
  inventoryController.orderController.add
);
orderRouter.post(
  "/verify-payment",
  inventoryValidation.orderValidation.verifyPayment,
  inventoryController.orderController.verifyPayment
);
orderRouter.post("/retry-payment", requireRecaptcha("checkout"), validateAccessToken, inventoryController.orderController.retryPayment);
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

// Order tracking — signed-in customer's own order, and the public
// /track-order lookup (order number + email/mobile).
orderRouter.get(
  "/tracking",
  validateAccessToken,
  inventoryValidation.orderValidation.tracking,
  inventoryController.orderController.tracking,
);
orderRouter.post(
  "/track",
  trackOrderRateLimiter,
  inventoryValidation.orderValidation.trackPublic,
  inventoryController.orderController.trackPublic,
);

export { orderRouter };
