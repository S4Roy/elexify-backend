import { fetchDetails } from "../../../controllers/admin/inventory/order/reconciliation/fetchDetails.js";
import { createOptions } from "../../../controllers/admin/inventory/order/add.js";
import { quote } from "../../../validations/admin/inventory/order/place.js";
import { updateAddress } from "../../../controllers/admin/inventory/order/updateAddress.js";
import { addressOptions } from "../../../controllers/admin/customerAccount/address.js";
import { addressEditSchema } from "../../../validations/admin/customerAccount/address.js";
import { recordManualPayment } from "../../../controllers/admin/inventory/order/recordManualPayment.js";
import { tracking } from "../../../controllers/admin/inventory/order/tracking.js";
import { celebrate, Joi } from "celebrate";
import { returnOperation } from "../../../controllers/admin/inventory/order/returnOperations.js";
import { bulkUpdateStatus, BULK_ORDER_STATUS_LIMIT } from "../../../controllers/admin/inventory/order/bulkUpdateStatus.js";
import { Router } from "express";
import { inventoryController } from "../../../controllers/admin/index.js";
import { inventoryValidation } from "../../../validations/admin/index.js";
import { requirePermission } from "../../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../../constants/adminPermissions.js";

const orderRouter = Router();
orderRouter.post('/reconciliation/fetch-details', requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({ audit_id: Joi.string().hex().length(24).required() }) }), fetchDetails);

orderRouter.get('/address/options', requirePermission(PERMISSIONS.ORDER_ADDRESS_MANAGE),
  celebrate({ query: Joi.object({ country: Joi.number().integer().positive() }) }), addressOptions);
orderRouter.put('/address', requirePermission(PERMISSIONS.ORDER_ADDRESS_MANAGE),
  celebrate({ body: addressEditSchema.keys({
    order_id: Joi.string().hex().length(24).required(),
    address_kind: Joi.string().valid('shipping', 'billing').required(),
    expected_address_id: Joi.string().hex().length(24).required(),
    charges_confirmed: Joi.boolean().valid(true).required(),
  }) }), updateAddress);

orderRouter.post('/payment/manual',
  requirePermission(PERMISSIONS.ORDER_PAYMENT_MANAGE),
  celebrate({ body: Joi.object({
    order_id: Joi.string().hex().length(24).required(),
    amount: Joi.number().positive().precision(2).strict().required(),
    currency: Joi.string().length(3).uppercase().required(),
    method: Joi.string().valid('bank_transfer', 'upi', 'cash').required(),
    reference: Joi.string().trim().min(3).max(100).required(),
    received_at: Joi.date().iso().max('now').required(),
    reason: Joi.string().trim().min(10).max(500).required(),
    confirmed: Joi.boolean().valid(true).required(),
  }) }), recordManualPayment,
);

orderRouter.get("/create-options", requirePermission(PERMISSIONS.ORDER_CREATE), celebrate({ query: Joi.object({ page: Joi.number().integer().min(1).max(100000).default(1), limit: Joi.number().integer().min(1).max(50).default(20), kind: Joi.string().valid("customers", "products"), search: Joi.string().max(100).allow(""), customer_id: Joi.string().hex().length(24) }) }), createOptions);
orderRouter.post("/quote", requirePermission(PERMISSIONS.ORDER_CREATE), quote, inventoryController.orderController.add);

orderRouter.get(
  "/list", requirePermission("orders.view"),
  inventoryValidation.orderValidation.list,
  inventoryController.orderController.list
);
orderRouter.get(
  "/export", requirePermission("orders.export"),
  celebrate({ query: Joi.object({
    import_source: Joi.string().valid("backup", "other").optional().allow("", null),
    customer_id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow("", null)
      .messages({ "string.pattern.base": "Invalid customer ID format" }),
    order_status: Joi.string().optional().allow("", null),
    payment_status: Joi.string().optional().allow("", null),
    payment_method: Joi.string().optional().allow("", null),
    from_date: Joi.string().optional().allow("", null),
    to_date: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    order_ids: Joi.string().optional().allow("", null),
    sort_by: Joi.string().optional().allow("", null)
      .valid("id", "created_at", "order_status", "total_items", "grand_total"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }) }),
  inventoryController.orderController.exportOrders,
);
orderRouter.get(
  "/customer-options", requirePermission("orders.view"),
  celebrate({ query: Joi.object({ search: Joi.string().max(100).allow("") }) }),
  inventoryController.orderController.customerOptions,
);
orderRouter.post("/shipping", requirePermission("orders.fulfill"), inventoryController.orderController.shipping);
orderRouter.get("/package/list", requirePermission("orders.view"), inventoryController.orderController.listPackages);
orderRouter.post("/package/retry", requirePermission("orders.fulfill"), inventoryController.orderController.retryPackage);
orderRouter.post("/package/cancel", requirePermission("orders.fulfill"), inventoryController.orderController.cancelPackage);

orderRouter.get("/tracking", requirePermission("orders.view"),
  celebrate({ query: Joi.object({
    order_id: Joi.string().hex().length(24).required(),
    refresh: Joi.boolean().default(false),
  }) }), tracking);
orderRouter.get(
  "/details", requirePermission("orders.view"),
  // inventoryValidation.orderValidation.list,
  inventoryController.orderController.order_details
);
orderRouter.post(
  "/place",
  requirePermission(PERMISSIONS.ORDER_CREATE),
  inventoryValidation.orderValidation.place,
  inventoryController.orderController.add
);
orderRouter.get("/stats", requirePermission("orders.view"), inventoryController.orderController.stats);
orderRouter.get("/overview", requirePermission("orders.view"), inventoryController.orderController.overview);
orderRouter.get("/trend", requirePermission("orders.view"), inventoryController.orderController.trend);
orderRouter.get(
  "/performance", requirePermission("orders.view"),
  inventoryController.orderController.performance
);
orderRouter.get(
  "/leaderboard", requirePermission("orders.view"),
  inventoryController.orderController.leaderboard
);
orderRouter.get(
  "/geo-stats", requirePermission("orders.view"),
  inventoryController.orderController.geoStats
);
orderRouter.post(
  "/cancel",
  requirePermission(PERMISSIONS.ORDER_CANCEL_MANAGE, "orders.refund"),
  inventoryValidation.orderValidation.cancel,
  inventoryController.orderController.cancel
);
orderRouter.post(
  "/cancel/force",
  requirePermission(PERMISSIONS.ORDER_FORCE_CANCEL, "orders.refund"),
  inventoryValidation.orderValidation.forceCancel,
  inventoryController.orderController.forceCancel
);
orderRouter.post(
  "/reopen",
  requirePermission(PERMISSIONS.ORDER_REOPEN_MANAGE),
  inventoryValidation.orderValidation.reopen,
  inventoryController.orderController.reopen
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
  "/status/bulk",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({
    order_ids: Joi.string()
      .trim()
      .required()
      .custom((value, helpers) => {
        const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
        if (!ids.length) return helpers.error("array.min");
        if (ids.length > BULK_ORDER_STATUS_LIMIT) return helpers.error("array.max");
        // Order.id (models/Order.js) is a human-readable string, not a Mongo
        // ObjectId — current orders are "ORD-######" (see
        // generateOrderNumber.js) but older/imported orders may differ, so
        // this only rules out obviously-wrong input rather than pinning the
        // exact format.
        if (!ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))) return helpers.error("any.invalid");
        return ids;
      }, "comma-separated order IDs")
      .messages({
        "array.min": "Provide at least one order ID",
        "array.max": `Provide at most ${BULK_ORDER_STATUS_LIMIT} order IDs per request`,
        "any.invalid": "One or more order IDs are invalid",
      }),
    status: Joi.string().valid("pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "failed").required(),
    reason: Joi.string().trim().min(10).max(500).required(),
  }) }),
  bulkUpdateStatus,
);
orderRouter.post(
  "/package/register-external",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({
    order_id: Joi.string().hex().length(24).required(),
    shiprocket_order_id: Joi.string().trim().pattern(/^\d+$/).required().messages({
      "string.pattern.base": "Shiprocket order ID must be numeric",
    }),
    reason: Joi.string().trim().min(10).max(500).required(),
  }) }),
  inventoryController.orderController.registerExternalPackage,
);
orderRouter.post(
  "/sync-shiprocket-status",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({
    order_id: Joi.string().hex().length(24).required(),
    channel_id: Joi.string().trim().max(64),
    package_ids: Joi.array().items(Joi.string().hex().length(24)).min(1).max(100).unique(),
  }) }),
  inventoryController.orderController.syncShiprocketStatus,
);
orderRouter.post(
  "/reconciliation/audit",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  inventoryController.orderController.reconciliationAudit,
);
orderRouter.post(
  "/reconciliation/apply",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  celebrate({ body: Joi.object({
    audit_id: Joi.string().hex().length(24).required(),
    confirmation: Joi.string().valid("APPLY RECONCILIATION").required().messages({
      "any.only": 'Type "APPLY RECONCILIATION" exactly to confirm this writes to potentially many orders.',
    }),
  }) }),
  inventoryController.orderController.reconciliationApply,
);
orderRouter.get(
  "/reconciliation/list",
  requirePermission(PERMISSIONS.ORDER_STATUS_MANAGE),
  inventoryController.orderController.reconciliationList,
);
orderRouter.post(
  "/refund/retry", requirePermission("orders.refund"),
  inventoryValidation.orderValidation.retryRefund,
  inventoryController.orderController.retryRefund
);
orderRouter.get("/invoice", requirePermission("orders.view"), inventoryController.orderController.invoice);
orderRouter.get("/invoice/zoho", requirePermission("orders.view"), inventoryController.orderController.zohoInvoiceStatus);
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
  requirePermission("orders.refund"),
  requirePermission(PERMISSIONS.RETURN_REVIEW),
  inventoryValidation.orderValidation.inspectReturn,
  inventoryController.orderController.inspectReturn,
);
orderRouter.post(
  "/returns/manual-refund/complete",
  requirePermission("orders.refund"),
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

orderRouter.post('/returns/operation', (req, res, next) => req.body.operation === 'refund' ? requirePermission('orders.refund')(req, res, next) : next(), requirePermission(PERMISSIONS.RETURN_REVIEW), celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  operation: Joi.string().valid('book', 'track', 'replacement', 'refund').required(),
  warehouse: Joi.string().trim().max(100).allow('').optional(),
  external_order_id: Joi.string().pattern(/^\d+$/).allow('').optional(),
  parcel: Joi.object({ length: Joi.number().positive().max(1000).required(), breadth: Joi.number().positive().max(1000).required(), height: Joi.number().positive().max(1000).required(), weight: Joi.number().positive().max(1000).required() }).optional(),
}) }), returnOperation);

export { orderRouter };
