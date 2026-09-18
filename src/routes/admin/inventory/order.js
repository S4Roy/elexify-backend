import { celebrate, Joi } from "celebrate";
import { returnOperation } from "../../../controllers/admin/inventory/order/returnOperations.js";
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
orderRouter.get("/package/list", inventoryController.orderController.listPackages);
orderRouter.post("/package/retry", inventoryController.orderController.retryPackage);
orderRouter.post("/package/cancel", inventoryController.orderController.cancelPackage);

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
  "/status",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({
    order_id: Joi.string().hex().length(24).required(),
    expected_status: Joi.string().required(),
    status: Joi.string().valid("pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "failed").required(),
    reason: Joi.string().trim().min(10).max(500).required(),
  }) }),
  inventoryController.orderController.updateStatus,
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
orderRouter.get(
  "/returns",
  requirePermission(PERMISSIONS.RETURN_VIEW),
  inventoryValidation.orderValidation.listReturns,
  inventoryController.orderController.listReturns,
);
orderRouter.post(
  "/returns/review",
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.reviewReturn,
  inventoryController.orderController.reviewReturn,
);
orderRouter.post(
  "/returns/receive",
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.receiveReturn,
  inventoryController.orderController.receiveReturn,
);
orderRouter.post(
  "/returns/inspect",
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.inspectReturn,
  inventoryController.orderController.inspectReturn,
);
orderRouter.post(
  "/returns/manual-refund/complete",
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.completeManualRefund,
  inventoryController.orderController.completeManualRefund,
);
orderRouter.post(
  "/returns/pickup",
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.updatePickup,
  inventoryController.orderController.updatePickup,
);

orderRouter.post('/returns/operation', requirePermission(PERMISSIONS.RETURN_REVIEW), celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  operation: Joi.string().valid('book', 'track', 'replacement', 'refund').required(),
  warehouse: Joi.string().trim().max(100).allow('').optional(),
  external_order_id: Joi.string().pattern(/^\d+$/).allow('').optional(),
  parcel: Joi.object({ length: Joi.number().positive().max(1000).required(), breadth: Joi.number().positive().max(1000).required(), height: Joi.number().positive().max(1000).required(), weight: Joi.number().positive().max(1000).required() }).optional(),
}) }), returnOperation);

export { orderRouter };
