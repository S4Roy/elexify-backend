import crypto from "crypto";
import { envs, StatusError } from "../../../../config/index.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import Coupon from "../../../../models/Coupon.js";
import CouponUsage from "../../../../models/CouponUsage.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import { inventoryService } from "../../../../services/index.js";
import User from "../../../../models/User.js";

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
    const order = await Order.findOneAndUpdate(
      { id: order_id, order_status: { $ne: "processing" } },
      {
        order_status: "processing",
        payment_status: "paid",
        payment_meta: {
          payment_provider: "razorpay",
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        },
        paid_at: new Date(),
      },
      { new: true }
    );
    // If coupon was used, record its usage
    const couponCode = order.coupon_code;
    const user = { _id: order.user };
    const currency = order.currency;
    const appliedDiscount = order.discount || 0;

    if (couponCode && appliedDiscount > 0) {
      const coupon = await Coupon.findOne({ code: couponCode }).exec();
      if (coupon) {
        const userData = await User.findById(order.user).exec();
        await CouponUsage.create({
          coupon: coupon._id,
          user: user._id,
          email: userData.email,
          order: order._id,
          discount_amount: appliedDiscount,
          currency,
        });

        // atomic counter increment
        await Coupon.updateOne(
          { _id: coupon._id },
          { $inc: { total_used: 1 } }
        );
      }
    }

    if (!order) {
      return res.status(200).json({
        status: "success",
        message: "Order already processed or not found",
      });
    }

    // 4️⃣ Get order items
    const items = await OrderItem.find({ order_id: order?._id });

    // 5️⃣ Reduce stock
    for (const item of items) {
      if (item.variation_id) {
        await ProductVariation.updateOne(
          { _id: item.variation_id },
          { $inc: { stock_quantity: -item.quantity } }
        );
      } else {
        await Product.updateOne(
          { _id: item.product_id },
          { $inc: { stock_quantity: -item.quantity } }
        );
      }
    }
    await inventoryService.cartService.clearCarts(order.user);
    return res.status(200).json({
      status: "success",
      message: "Payment verified, order confirmed, and stock reduced",
      payment_id: razorpay_payment_id,
    });
  } catch (error) {
    console.error("❌ verifyPayment error:", error);
    next(error);
  }
};
