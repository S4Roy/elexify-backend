import crypto from "crypto";
import Razorpay from "razorpay";
import { envs, StatusError } from "../../../../config/index.js";
import { orderService } from "../../../../services/index.js";

const razorpay = new Razorpay({ key_id: envs.razorpay.key_id, key_secret: envs.razorpay.key_secret });

export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, order_id } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !order_id) {
      throw StatusError.badRequest("Missing Razorpay verification fields");
    }
    const expected = crypto.createHmac("sha256", envs.razorpay.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) throw StatusError.badRequest("Payment signature mismatch");
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment?.order_id !== razorpay_order_id) throw StatusError.badRequest("Payment does not match Razorpay order");
    const result = await orderService.finalizeCapturedPayment({
      orderId: order_id, paymentData: payment, source: "admin_verification",
    });
    return res.status(200).json({
      status: "success",
      message: result.alreadyFinalized ? "Payment already verified" : "Payment verified and order finalized",
      payment_id: payment.id,
    });
  } catch (error) {
    next(error);
  }
};
