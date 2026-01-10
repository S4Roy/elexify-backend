import mongoose from "mongoose";
import Cart from "../../../../models/Cart.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import Product from "../../../../models/Product.js";
import ExchangeRate from "../../../../models/ExchangeRate.js"; // ✅
import { StatusError } from "../../../../config/index.js";
import { paymentService } from "../../../../services/index.js";

export const add = async (req, res, next) => {
  try {
    const {
      currency = "INR",
      receipt,
      email,
      phone,
      first_name,
      last_name,
      address,
      payment_method,
      discount = 0,
      shipping = 0,
    } = req.body;

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token.");
    }

    // ✅ Get latest exchange rate
    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const exchangeRate = ratesDoc?.rates?.get(currency) ?? 1;

    const carts = await Cart.find({
      deleted_at: null,
      ...(user_id ? { user: user_id } : { guest_id }),
    }).populate("product variation");

    if (!carts.length) {
      throw StatusError.badRequest("No carts found for the user.");
    }

    const items = [];
    let total = 0;

    for (const cart of carts) {
      const product = cart.product;
      const variation = cart.variation;

      if (!product && !variation) {
        console.warn(
          `Skipping cart with missing product/variation: ${cart._id}`
        );
        continue;
      }

      const quantity = cart.quantity;
      const base_unit_price = parseFloat(cart.price);
      const base_total_price = parseFloat(
        cart.total_price || base_unit_price * quantity
      );

      const converted_unit_price = parseFloat(
        (base_unit_price * exchangeRate).toFixed(2)
      );
      const converted_total_price = parseFloat(
        (base_total_price * exchangeRate).toFixed(2)
      );

      items.push({
        product_id: product._id,
        variation_id: variation?._id || null,
        quantity,
        unit_price: converted_unit_price,
        total_price: converted_total_price,
        base_unit_price,
        base_total_price,
      });

      total += converted_total_price;
    }

    if (!items.length) {
      throw StatusError.badRequest("No valid products found in the cart.");
    }

    const order_id = `ORD-${Date.now()}`;
    const customer = {
      first_name: first_name || "Guest",
      last_name: last_name || "User",
      email: email || "guest@example.com",
      phone: phone || null,
    };

    let user = null;
    if (user_id) {
      user = await User.findOne({ _id: new mongoose.Types.ObjectId(user_id) });
    } else {
      user = await User.findOne({ email: customer.email });
    }

    if (!user) {
      user = await User.create({
        role: "customer",
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        mobile: customer.phone,
        password: "external_order",
        status: "active",
      });
    }

    // 📦 Create/find billing address
    let billingAddress = null;
    if (address?.address_line_1) {
      const billingFilter = {
        user: user._id,
        full_name: `${customer.first_name} ${customer.last_name}`,
        phone: customer.phone,
        email: customer.email,
        address_line_1: address.address_line_1,
        city: address.city || "",
        state: address.state || "",
        country: address.country || "",
        postcode: address.postcode || "",
      };

      billingAddress = await Address.findOne(billingFilter);
      if (!billingAddress) {
        billingAddress = await Address.create({
          ...billingFilter,
          address_line_2: address.address_line_2 || "",
          land_mark: address.land_mark || "",
          address_type: "residential",
          purpose: "billing",
          is_default: true,
          created_by: user._id,
        });
      }
    }

    const discountAmount = parseFloat((discount * exchangeRate).toFixed(2));
    const shippingAmount = parseFloat((shipping * exchangeRate).toFixed(2));
    const grandTotal = parseFloat(total.toFixed(2));
    const sub_total = parseFloat(
      (grandTotal - discountAmount + shippingAmount).toFixed(2)
    );

    const order = await Order.create({
      id: order_id,
      user: user._id,
      billing_address: billingAddress?._id ?? null,
      shipping_address: billingAddress?._id ?? null,
      payment_status: "pending",
      order_status: "pending",
      total_amount: sub_total,
      discount: discountAmount,
      shipping: shippingAmount,
      grand_total: grandTotal,
      currency, // ✅ Save currency
      payment_method,
      transaction_id: `EXT-${order_id}`,
      note: "Guest Checkout",
      currency: currency,
      exchnage_rate: exchangeRate,
    });

    const orderItems = [];

    for (const item of items) {
      const productDoc = await Product.findOne({ _id: item.product_id });
      if (!productDoc) {
        console.warn(`Product not found for ID: ${item.product_id}`);
        continue;
      }

      orderItems.push({
        order_id: order._id,
        product_id: productDoc._id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        regular_price: item.base_unit_price,
        sale_price: item.unit_price, // Assume current unit_price is final
        currency: currency,
        exchnage_rate: exchangeRate,
      });
    }

    if (!orderItems.length) {
      throw StatusError.badRequest("No valid order items to save.");
    }

    await OrderItem.insertMany(orderItems);

    // 🧹 Clear cart
    await Cart.deleteMany({
      deleted_at: null,
      ...(user_id ? { user: user_id } : { guest_id }),
    });

    let razorpay = null;
    if (payment_method === "razorpay") {
      const razorpayOrder = await paymentService.createRazorpayOrder(
        sub_total,
        currency,
        order_id
      );
      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "razorpay",
            razorpay_order_id: razorpayOrder.id,
            razorpay_payment_id: null,
            razorpay_signature: null,
          },
        }
      );

      razorpay = razorpayOrder;
    }

    return res.status(200).json({
      status: "success",
      message: "Order placed successfully",
      data: {
        order,
        razorpay,
        items: orderItems,
      },
    });
  } catch (error) {
    console.error("❌ Order creation failed:", error.message);
    next(error);
  }
};
