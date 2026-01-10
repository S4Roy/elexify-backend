import Order from "../../models/Order.js";
import axios from "axios";
import { envs } from "../../config/index.js";

export const updatePendingRazorpayPayments = async () => {
  const pendingOrders = await Order.find({
    order_status: "pending",
    payment_status: "pending",
    payment_method: "razorpay",
    "payment_meta.razorpay_order_id": { $ne: null },
  });

  const now = new Date();

  for (const order of pendingOrders) {
    const razorpayOrderId = order.payment_meta?.razorpay_order_id;

    if (!razorpayOrderId) continue;

    try {
      const { data } = await axios.get(
        `https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`,
        {
          auth: {
            username: envs.razorpay.key_id,
            password: envs.razorpay.key_secret,
          },
        }
      );

      const payments = data.items || [];

      const latestPayment = payments.find((p) => p.status === "captured");

      if (latestPayment) {
        // ✅ Success
        order.payment_status = "paid";
        order.order_status = "processing";
        order.paid_at = new Date();
        order.payment_meta.razorpay_payment_id = latestPayment.id;
        order.payment_meta.razorpay_signature =
          latestPayment?.razorpay_signature ?? null;
        await order.save();

        console.log(`[✅ Razorpay] Payment captured for order: ${order.id}`);
      } else if (payments.some((p) => p.status === "failed")) {
        // ❌ Failed
        order.payment_status = "failed";
        order.order_status = "failed";
        order.paid_at = new Date();
        await order.save();

        console.log(`[❌ Razorpay] Payment failed for order: ${order.id}`);
      } else if (!payments.length) {
        const created_at = order.created_at || order._id.getTimestamp();
        const minutesSince = (now - created_at) / 1000 / 60;

        if (minutesSince > 15) {
          // 🕒 Timeout fallback
          order.payment_status = "failed";
          order.order_status = "failed";
          order.paid_at = new Date();
          await order.save();

          console.log(
            `[⌛ Razorpay] No payment made in 15+ mins. Marking order ${order.id} as failed.`
          );
        } else {
          console.log(
            `[⏳ Razorpay] No payment yet for order ${order.id}. Waiting...`
          );
        }
      }
    } catch (err) {
      console.error(
        `[Razorpay Check] Failed for Order ${order.id}:`,
        err?.response?.data || err.message || err
      );
    }
  }
};
