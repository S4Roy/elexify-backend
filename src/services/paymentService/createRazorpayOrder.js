import { envs } from "../../config/index.js";
import Razorpay from "razorpay";
import Order from "../../models/Order.js";

const razorpay = new Razorpay({
  key_id: envs.razorpay.key_id,
  key_secret: envs.razorpay.key_secret,
});

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
    const order = await Order.findOneAndUpdate(
      { id: receipt },
      {
        order_status: "failed",
        payment_status: "failed",
        payment_meta: {
          payment_provider: "razorpay",
          razorpay_order_id: null,
          razorpay_payment_id: null,
          razorpay_signature: null,
        },
        paid_at: new Date(),
      },
      { new: true }
    );
    throw err;
  }
};
