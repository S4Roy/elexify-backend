import Order from "../../models/Order.js";
import axios from "axios";
import { envs } from "../../config/index.js";
import { paymentService } from "../../services/index.js"; // <-- ensure this exports capturePayPalOrder

export const updatePendingPaypalPayments = async () => {
  const pendingOrders = await Order.find({
    order_status: "pending",
    payment_status: "pending",
    payment_method: "paypal",
    "payment_meta.paypal_order_id": { $ne: null },
  });

  const now = new Date();

  for (const order of pendingOrders) {
    const paypal_order_id = order.payment_meta?.paypal_order_id;

    if (!paypal_order_id) continue;

    try {
      const result = await paymentService.checkPaypalStatus(
        String(paypal_order_id),
        order?.id
      );
      if (result?.success) {
        console.log(result?.payment_status, result?.order_status);
      }
    } catch (err) {
      console.error(
        `[Paypal Check] Failed for Order ${order.id}:`,
        err?.response?.data || err.message || err
      );
    }
  }
};
