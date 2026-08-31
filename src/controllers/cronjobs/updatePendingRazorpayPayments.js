import Order from "../../models/Order.js";
import axios from "axios";
import { envs } from "../../config/index.js";
import { orderService, notificationService } from "../../services/index.js";

export const updatePendingRazorpayPayments = async () => {
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
        { auth: { username: envs.razorpay.key_id, password: envs.razorpay.key_secret } },
      );
      const payments = data.items || [];
      const captured = payments.find((payment) => payment.status === "captured");
      if (captured) {
        const result = await orderService.finalizeCapturedPayment({
          orderId: order.id, paymentData: captured, source: "reconciliation",
        });
        if (!result.alreadyFinalized) {
          notificationService
            .sendNotification({
              userId: result.order.user,
              event: "PAYMENT_SUCCESS",
              data: { order_id: result.order.id },
              dedupeKey: `${result.order.id}:PAYMENT_SUCCESS`,
            })
            .catch(() => {});
        }
      } else if (payments.some((payment) => payment.status === "failed")) {
        await orderService.transitionOrder({
          orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
        });
        notificationService
          .sendNotification({
            userId: order.user,
            event: "PAYMENT_FAILED",
            data: { order_id: order.id },
            dedupeKey: `${order.id}:PAYMENT_FAILED`,
          })
          .catch(() => {});
      } else if (!payments.length) {
        const createdAt = order.created_at || order._id.getTimestamp();
        if ((now - createdAt) / 60000 > 15) {
          await orderService.transitionOrder({
            orderId: order._id, paymentStatus: "failed", orderStatus: "failed",
          });
          notificationService
            .sendNotification({
              userId: order.user,
              event: "PAYMENT_FAILED",
              data: { order_id: order.id },
              dedupeKey: `${order.id}:PAYMENT_FAILED`,
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      console.error(`[Razorpay reconciliation] ${order.id}:`, error?.response?.data || error?.message || error);
    }
  }
};
