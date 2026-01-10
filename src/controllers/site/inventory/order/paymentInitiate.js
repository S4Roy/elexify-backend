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

export const paymentInitiate = async (req, res, next) => {
  try {
    const { order_id, payment_method } = req.body;

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;
    // Ensure required fields

    const order = await Order.findOne({ _id: order_id });

    if (!order) {
      throw StatusError.notFound("Order not found");
    }
    let razorpay = null;
    if (payment_method == "razorpay") {
      razorpay = await paymentService.createRazorpayOrder(
        order?.grand_total,
        order?.currency || "INR",
        order?.id
      );
    }
    return res.status(200).json({
      status: "success",
      message: "Payment Initiated successfully",
      data: { order: order, razorpay: razorpay },
    });
  } catch (error) {
    console.error("❌ Order initiation failed:", error.message);
    next(error);
  }
};
