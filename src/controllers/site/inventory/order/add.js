import mongoose from "mongoose";
import Cart from "../../../../models/Cart.js";
import TempCart from "../../../../models/TempCart.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import Product from "../../../../models/Product.js";
import ExchangeRate from "../../../../models/ExchangeRate.js"; // ✅
import { StatusError } from "../../../../config/index.js";
import {
  paymentService,
  inventoryService,
} from "../../../../services/index.js";

export const add = async (req, res, next) => {
  try {
    const {
      currency = "INR",
      receipt,
      shipping_address = {},
      billing_address = {},
      payment_method,
      shipping = 0,
      isDirectCheckout,
      coupon_code = null,
    } = req.body;

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token.");
    }

    // ✅ Get latest exchange rate
    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const exchangeRate = ratesDoc?.rates?.get(currency) ?? 1;
    let carts = [];
    if (isDirectCheckout) {
      // Handle direct checkout specific logic
      carts = await TempCart.find({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      }).populate("product variation");
    } else {
      carts = await Cart.find({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      }).populate("product variation");
    }

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
        customization_id: cart?.customization_id || null,
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
      first_name: billing_address.first_name || "Guest",
      last_name: billing_address.last_name || "User",
      email: billing_address.email || "guest@example.com",
      phone: billing_address.phone || null,
    };

    // let user = null;
    // if (user_id) {
    //   user = await User.findOne({ _id: new mongoose.Types.ObjectId(user_id) });
    // } else {
    //   user = await User.findOne({ email: customer.email });
    // }

    // if (!user) {
    //   user = await User.create({
    //     role: "customer",
    //     name: `${customer.first_name} ${customer.last_name}`,
    //     email: customer.email,
    //     mobile: customer.phone,
    //     password: "external_order",
    //     status: "active",
    //   });
    // }
    let user = null;

    // ===============================
    // CASE 1: LOGGED-IN USER
    // ===============================
    if (user_id) {
      user = await User.findById(user_id);

      if (!user) {
        throw StatusError.unauthorized("Invalid user session.");
      }
    }

    // ===============================
    // CASE 2: GUEST CHECKOUT
    // ===============================
    else {
      const existingUser = await User.findOne({
        email: customer.email,
        status: "active",
      });

      // 🚫 BLOCK guest checkout with registered email
      if (existingUser) {
        throw StatusError.conflict(
          "This email is already registered. Please login to continue checkout."
        );
      }

      // ✅ Create new guest-based user
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
    if (billing_address?.address_line_1) {
      const billingFilter = {
        user: user._id,
        full_name: `${customer.first_name} ${customer.last_name}`,
        phone_code: billing_address.phone_code,
        phone: customer.phone,
        email: customer.email,
        address_line_1: billing_address.address_line_1,
        city: billing_address.city || "",
        state: billing_address.state || "",
        country: billing_address.country || "",
        postcode: billing_address.postcode || "",
      };

      billingAddress = await Address.findOne(billingFilter);
      if (!billingAddress) {
        billingAddress = await Address.create({
          ...billingFilter,
          address_line_2: billing_address.address_line_2 || "",
          land_mark: billing_address.land_mark || "",
          address_type: "residential",
          purpose: "billing",
          is_default: true,
          created_by: user._id,
        });
      }
    }

    let shippingAddress = null;
    if (shipping_address?.address_line_1) {
      const shippingFilter = {
        user: user._id,
        full_name: `${shipping_address.first_name} ${shipping_address.last_name}`,
        phone: shipping_address.phone,
        phone_code: shipping_address.phone_code,
        email: shipping_address.email,
        address_line_1: shipping_address.address_line_1,
        city: shipping_address.city || "",
        state: shipping_address.state || "",
        country: shipping_address.country || "",
        postcode: shipping_address.postcode || "",
      };

      shippingAddress = await Address.findOne(shippingFilter);
      if (!shippingAddress) {
        shippingAddress = await Address.create({
          ...shippingFilter,
          address_line_2: shipping_address.address_line_2 || "",
          land_mark: shipping_address.land_mark || "",
          address_type: "residential",
          purpose: "shipping",
          is_default: true,
          created_by: user._id,
        });
      }
    }
    let discount = 0;
    // ✅ Validate and apply coupon if provided
    if (coupon_code) {
      const couponData = await inventoryService.cartService.validateCoupon({
        code: coupon_code,
        user: user ? { _id: user._id, role: user.role } : null,
        carts,
        currency,
      });
      console.log(couponData);

      discount = couponData.discount;
    }
    const discountAmount = parseFloat(discount.toFixed(2));
    const shippingAmount = parseFloat((shipping * exchangeRate).toFixed(2));
    const sub_total = parseFloat(total.toFixed(2));
    const grandTotal = parseFloat(
      (sub_total - discountAmount + shippingAmount).toFixed(2)
    );

    const order = await Order.create({
      id: order_id,
      user: user._id,
      billing_address: billingAddress?._id ?? null,
      shipping_address: shippingAddress?._id ?? null,
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
      total_items: items.length,
      coupon_code: coupon_code || null,
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
        customization_id: item?.customization_id,
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

    if (isDirectCheckout) {
      // 🧹 Clear cart
      await TempCart.deleteMany({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      });
    } else {
      if (guest_id) {
        await inventoryService.cartService.transferGuestCartToUser(
          guest_id,
          user._id
        );
        await inventoryService.wishlistService.transferGuestWishlistToUser(
          guest_id,
          user._id
        );
      }
    }

    let providerResponse = null;

    // --- RAZORPAY (existing) ---
    if (payment_method === "razorpay") {
      const razorpayOrder = await paymentService.createRazorpayOrder(
        grandTotal,
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

      providerResponse = { provider: "razorpay", data: razorpayOrder };
    }

    // --- PAYPAL BRANCH ---
    else if (payment_method === "paypal") {
      // createPayPalOrder(totalAmount, currency, receipt, items)
      // returns { paypalOrderId, dbOrderId, raw }
      const paypalResp = await paymentService.createPayPalOrder(
        grandTotal,
        currency,
        order_id,
        items
      );

      // update Order record with PayPal metadata
      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "paypal",
            paypal_order_id: paypalResp.paypalOrderId,
            paypal_capture_id: null,
            paypal_payment_status: "CREATED",
          },
        }
      );

      providerResponse = { provider: "paypal", data: paypalResp };
    }

    return res.status(200).json({
      status: "success",
      message: "Order placed successfully",
      data: {
        order,
        providerResponse,
        items: orderItems,
      },
    });
  } catch (error) {
    console.error("❌ Order creation failed:", error.message);
    next(error);
  }
};
