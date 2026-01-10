import crypto from "crypto";
import { envs, StatusError } from "../../../config/index.js";
import Consultation from "../../../models/Consultation.js";

export const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      order_id,
    } = req.body;

    // 1️⃣ Basic validation
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      throw StatusError.badRequest("Missing Razorpay credentials");
    }

    // 2️⃣ Verify payment signature
    const hmac = crypto
      .createHmac("sha256", envs.razorpay.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (hmac !== razorpay_signature) {
      throw StatusError.badRequest("Payment signature mismatch");
    }

    // 3️⃣ Update order only if not already processing
    const order = await Consultation.findOneAndUpdate(
      { _id: order_id, payment: { status: { $eq: "pending" } } },
      {
        payment: {
          status: "success",
          paid_at: new Date(),
          razorpay_payment_id,
        },
      },
      { new: true }
    );

    if (!order) {
      return res.status(200).json({
        status: "success",
        message: "consultation already processed or not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Payment verified, consultation confirmed",
      payment_id: razorpay_payment_id,
    });
  } catch (error) {
    console.error("❌ verifyPayment error:", error);
    next(error);
  }
};
