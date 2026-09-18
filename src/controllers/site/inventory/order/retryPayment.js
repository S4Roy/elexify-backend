import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import { StatusError } from "../../../../config/index.js";
import { getRazorpayClient, getRazorpayConfig } from "../../../../services/integrationCredentials/razorpay.js";

const RETRY_WINDOW_MS = 60 * 60 * 1000;

export const retryPayment = async (req, res, next) => {
  try {
    const userId = req.auth?.user_id;
    const orderId = req.body?.order_id;
    if (!userId) throw StatusError.unauthorized("Login required to retry payment");
    if (!mongoose.Types.ObjectId.isValid(orderId)) throw StatusError.badRequest("Invalid order ID");

    const order = await Order.findOne({ _id: orderId, user: userId, deleted_at: null });
    if (!order) throw StatusError.notFound("Order not found");

    const expiresAt = new Date(order.created_at).getTime() + RETRY_WINDOW_MS;
    if (order.order_status !== "pending" || !["pending", "failed"].includes(order.payment_status)) {
      throw StatusError.conflict("This order is no longer awaiting payment");
    }
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      throw StatusError.conflict("The one-hour payment retry window has expired");
    }
    if (order.payment_method !== "razorpay" && !(order.payment_method === "cod" && order.is_partial_cod)) {
      throw StatusError.badRequest("This order does not have an online payment to retry");
    }

    const providerOrderId = order.payment_meta?.razorpay_order_id;
    if (!providerOrderId) throw StatusError.conflict("Payment is not ready to retry. Please contact support");

    const razorpay = await getRazorpayClient();
    const providerOrder = await razorpay.orders.fetch(providerOrderId);
    const amount = Math.round(Number(order.is_partial_cod ? order.advance_amount : order.grand_total) * 100);
    if (providerOrder?.id !== providerOrderId || Number(providerOrder.amount) !== amount ||
        providerOrder.currency !== order.currency || providerOrder.status === "paid" || Number(providerOrder.amount_paid) > 0) {
      throw StatusError.conflict("Payment status has changed. Refresh this order before retrying");
    }

    const { key_id } = await getRazorpayConfig();
    return res.status(200).json({
      status: "success",
      data: { id: providerOrderId, amount, currency: order.currency, checkout_key_id: key_id, order_id: order.id, expires_at: new Date(expiresAt) },
    });
  } catch (error) {
    next(error);
  }
};
