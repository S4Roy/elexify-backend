import Order from "../../models/Order.js";
import axios from "axios";
import { orderService, notificationService, auditService } from "../../services/index.js";
import { getRazorpayConfig } from "../../services/integrationCredentials/razorpay.js";

export const updatePendingRazorpayPayments = async () => {
  const credentials = await getRazorpayConfig();
  const pendingOrders = await Order.find({
    order_status: "pending", payment_status: "pending", payment_method: { $in: ["razorpay", "cod"] },
    "payment_meta.razorpay_order_id": { $ne: null },
  });
  const now = new Date();
  for (const order of pendingOrders) {
    const providerOrderId = order.payment_meta?.razorpay_order_id;
    if (!providerOrderId) continue;
    try {
      const { data } = await axios.get(
        `https://api.razorpay.com/v1/orders/${providerOrderId}/payments`,
        { auth: { username: credentials.key_id, password: credentials.key_secret } },
      );
      const payments = data.items || [];
      const captured = payments.find((payment) => payment.status === "captured");
      if (captured) {
        const result = await orderService.finalizeCapturedPayment({
          orderId: order.id, paymentData: captured, source: "reconciliation",
        });
        if (!result.alreadyFinalized) {
          notificationService.sendOrderNotification({
            order: result.order,
            event: "PAYMENT_SUCCESS",
            dedupeKey: `${result.order.id}:PAYMENT_SUCCESS`,
          });
        }
      } else if (payments.some((payment) => payment.status === "failed")) {
        const failedPayment = payments.find((payment) => payment.status === "failed") || {};
        await orderService.transitionOrder({
          orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
        });
        notificationService.sendOrderNotification({
          order,
          event: "PAYMENT_FAILED",
          dedupeKey: `${order.id}:PAYMENT_FAILED`,
        });
        await auditService.recordAudit({ userId: order.user, event: "PAYMENT_FAILED",
          metadata: { order_id: order.id, reason: "razorpay_failed",
            razorpay_order_id: providerOrderId, razorpay_payment_id: failedPayment.id || null,
            amount: order.grand_total, currency: order.currency, payment_method: order.payment_method,
            customer_email: order.billing_address_snapshot?.email || null,
            customer_phone: order.billing_address_snapshot?.phone || null,
            error_code: failedPayment.error_code || null,
            error_reason: failedPayment.error_reason || null,
            error_description: failedPayment.error_description || null,
            attempted_method: failedPayment.method || null,
            attempted_at: failedPayment.created_at ? new Date(failedPayment.created_at * 1000) : null } });
      } else if (!payments.length) {
        const createdAt = order.created_at || order._id.getTimestamp();
        const minutesElapsed = (now - createdAt) / 60000;
        if (minutesElapsed > 15) {
          await orderService.transitionOrder({
            orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
          });
          notificationService.sendOrderNotification({
            order,
            event: "PAYMENT_FAILED",
            dedupeKey: `${order.id}:PAYMENT_FAILED`,
          });
          await auditService.recordAudit({ userId: order.user, event: "PAYMENT_FAILED",
            metadata: { order_id: order.id, reason: "timed_out",
              razorpay_order_id: providerOrderId, minutes_elapsed: Math.round(minutesElapsed),
              amount: order.grand_total, currency: order.currency, payment_method: order.payment_method,
              customer_email: order.billing_address_snapshot?.email || null,
              customer_phone: order.billing_address_snapshot?.phone || null } });
        }
      }
    } catch (error) {
      console.error(`[Razorpay reconciliation] ${order.id}:`, error?.response?.data || error?.message || error);
    }
  }
};
