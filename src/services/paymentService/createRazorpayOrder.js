import { envs } from "../../config/index.js";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: envs.razorpay.key_id,
  key_secret: envs.razorpay.key_secret,
});

export const findRazorpayOrderByReceipt = async ({ receipt, amount, currency }) => {
  const response = await razorpay.orders.all({ receipt, count: 100 });
  const candidates = (response?.items || []).filter((order) =>
    order.receipt === receipt &&
    order.amount === Math.round(Number(amount) * 100) &&
    order.currency === String(currency).toUpperCase(),
  );
  if (candidates.length > 1) {
    const error = new Error("Multiple Razorpay orders match the checkout receipt; manual reconciliation required");
    error.code = "AMBIGUOUS_PROVIDER_ORDERS";
    throw error;
  }
  return candidates[0] || null;
};

export const createRazorpayOrder = async (totalAmount, currency, receipt) => {
  try {
    const options = {
      amount: Math.round(totalAmount * 100), // 🔧 FIXED: ensure integer
      currency,
      receipt: receipt,
    };

    const order = await razorpay.orders.create(options);
    return order;
  } catch (err) {
    console.error("❌ Razorpay Order Creation Error:", err);
    throw err;
  }
};
