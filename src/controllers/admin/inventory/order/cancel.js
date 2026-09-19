import { orderService, notificationService, auditService } from "../../../../services/index.js";

export const cancel = async (req, res, next) => {
  try {
    const { order_id, reason, comment } = req.body;
    const admin_id = req.auth?.user_id || null;

    const order = await orderService.cancelOrder({
      orderId: order_id,
      actorType: "admin",
      actorId: admin_id,
      reason,
      comment,
    });

    await auditService.recordAudit({
      userId: order.user,
      actorId: admin_id,
      req,
      event: "ORDER_CANCELLED",
      reason,
      metadata: { order_id: order._id, comment: comment || null },
    });

    notificationService
      .sendOrderNotification({
        order,
        event: "ORDER_CANCELLED",
        dedupeKey: `${order.id}:ORDER_CANCELLED`,
      });

    return res.status(200).json({
      status: "success",
      message: "Order cancelled successfully",
      data: {
        order_status: order.order_status,
        payment_status: order.payment_status,
        cancellation: order.cancellation,
        refund: order.refund,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Undoes a cancellation back to "processing" (requirePermission(ORDER_REOPEN_MANAGE)
// in routes/admin/inventory/order.js) via orderService.reopenOrder, which
// itself refuses if a refund already went through and re-reserves inventory
// inside a transaction. Always audit-logged with the admin's justification.
export const reopen = async (req, res, next) => {
  try {
    const { order_id, reason } = req.body;
    const admin_id = req.auth?.user_id || null;

    const order = await orderService.reopenOrder({
      orderId: order_id,
      actorId: admin_id,
      reason,
    });

    await auditService.recordAudit({
      userId: order.user,
      actorId: admin_id,
      req,
      event: "ORDER_REOPENED",
      reason,
      metadata: { order_id: order._id },
    });

    notificationService
      .sendOrderNotification({
        order,
        event: "ORDER_PROCESSING",
        dedupeKey: `${order.id}:ORDER_REOPENED`,
      });

    return res.status(200).json({
      status: "success",
      message: "Order reopened successfully",
      data: {
        order_status: order.order_status,
        payment_status: order.payment_status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Superadmin-only override (requirePermission(ORDER_FORCE_CANCEL) in
// routes/admin/inventory/order.js) — bypasses the normal eligibility rules
// via orderService.cancelOrder's `force` flag. Always audit-logged with the
// admin's free-text justification since this skips guardrails the regular
// cancel path enforces.
export const forceCancel = async (req, res, next) => {
  try {
    const { order_id, reason } = req.body;
    const admin_id = req.auth?.user_id || null;

    const order = await orderService.cancelOrder({
      orderId: order_id,
      actorType: "admin",
      actorId: admin_id,
      reason,
      force: true,
    });

    await auditService.recordAudit({
      userId: order.user,
      actorId: admin_id,
      req,
      event: "ORDER_FORCE_CANCELLED",
      reason,
      metadata: { order_id: order._id },
    });

    notificationService
      .sendOrderNotification({
        order,
        event: "ORDER_CANCELLED",
        dedupeKey: `${order.id}:ORDER_CANCELLED`,
      });

    return res.status(200).json({
      status: "success",
      message: "Order force-cancelled successfully",
      data: {
        order_status: order.order_status,
        payment_status: order.payment_status,
        cancellation: order.cancellation,
        refund: order.refund,
      },
    });
  } catch (error) {
    next(error);
  }
};
