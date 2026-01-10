import mongoose from "mongoose";
import Cart from "../../../../models/Cart.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";
import { paymentService } from "../../../../services/index.js";
import crypto from "crypto";
import { envs } from "../../../../config/index.js";

export const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      order_id,
    } = req.body;

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;
    // Ensure required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature)
      throw StatusError.badRequest("Missing Razorpay credentials");

    const hmac = crypto
      .createHmac("sha256", envs.razorpay.key_secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");
    if (hmac !== razorpay_signature) {
      throw StatusError.badRequest("Payment signature mismatch");
    }
    const order = await Order.findOneAndUpdate(
      { _id: order_id },
      {
        order_status: "processing",
        payment_status: "paid",
        payment_meta: {
          payment_provider: "razorpay",
          razorpay_order_id,
          razorpay_payment_id: razorpay_payment_id,
          razorpay_signature,
        },
        paid_at: new Date(),
      },
      { new: true }
    );

    if (!order) {
      throw StatusError.notFound("Order not found");
    }
    return res.status(200).json({
      status: "success",
      message: "Payment verified successfully",
      payment_id: razorpay_payment_id,
    });
  } catch (error) {
    console.error("❌ Order verification failed:", error.message);
    next(error);
  }
};
