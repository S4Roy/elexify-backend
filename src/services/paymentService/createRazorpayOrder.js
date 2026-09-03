import { getRazorpayClient, getRazorpayContext } from "../integrationCredentials/razorpay.js";

export const findRazorpayOrderByReceipt = async ({ receipt, amount, currency }) => {
  const razorpay = await getRazorpayClient();
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
    const { client: razorpay, credentials } = await getRazorpayContext();
    const options = {
      amount: Math.round(totalAmount * 100), // 🔧 FIXED: ensure integer
      currency,
      receipt: receipt,
    };

    const order = await razorpay.orders.create(options);
    // key_id is intentionally public and required by Razorpay Checkout.
    // No secret, account id, or webhook secret is included in this payload.
    return { ...order, checkout_key_id: credentials.key_id };
  } catch (err) {
    console.error("❌ Razorpay Order Creation Error:", err);
    throw err;
  }
};
