import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";
import { requirePermission } from "../../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../../constants/adminPermissions.js";

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
orderRouter.get("/trend", inventoryController.orderController.trend);
orderRouter.get(
  "/performance",
  inventoryController.orderController.performance
);
orderRouter.get(
  "/leaderboard",
  inventoryController.orderController.leaderboard
);
orderRouter.get(
  "/geo-stats",
  inventoryController.orderController.geoStats
);
orderRouter.post(
  "/cancel",
  inventoryValidation.orderValidation.cancel,
  inventoryController.orderController.cancel
);
orderRouter.post(
  "/refund/retry",
  inventoryValidation.orderValidation.retryRefund,
  inventoryController.orderController.retryRefund
);
orderRouter.get("/invoice", inventoryController.orderController.invoice);
orderRouter.get("/invoice/zoho", inventoryController.orderController.zohoInvoiceStatus);
orderRouter.post(
  "/invoice/zoho/sync",
  requirePermission(PERMISSIONS.ZOHO_INVOICE_MANAGE),
  inventoryController.orderController.syncZohoInvoice,
);

export { orderRouter };
