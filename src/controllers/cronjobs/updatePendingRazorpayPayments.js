import Order from "../../models/Order.js";
import axios from "axios";
import { orderService, notificationService } from "../../services/index.js";
import { getRazorpayConfig } from "../../services/integrationCredentials/razorpay.js";

export const updatePendingRazorpayPayments = async () => {
  const credentials = await getRazorpayConfig();
  const pendingOrders = await Order.find({
    order_status: "pending", payment_status: "pending", payment_method: "razorpay",
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
        await orderService.transitionOrder({
          orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
        });
        notificationService.sendOrderNotification({
          order,
          event: "PAYMENT_FAILED",
          dedupeKey: `${order.id}:PAYMENT_FAILED`,
        });
      } else if (!payments.length) {
        const createdAt = order.created_at || order._id.getTimestamp();
        if ((now - createdAt) / 60000 > 15) {
          await orderService.transitionOrder({
            orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
          });
          notificationService.sendOrderNotification({
            order,
            event: "PAYMENT_FAILED",
            dedupeKey: `${order.id}:PAYMENT_FAILED`,
          });
        }
      }
    } catch (error) {
      console.error(`[Razorpay reconciliation] ${order.id}:`, error?.response?.data || error?.message || error);
    }
  }
};
