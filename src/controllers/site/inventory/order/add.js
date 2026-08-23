import mongoose from "mongoose";
import Cart from "../../../../models/Cart.js";
import TempCart from "../../../../models/TempCart.js";
import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import User from "../../../../models/User.js";
import Address from "../../../../models/Address.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import { StatusError } from "../../../../config/index.js";
import {
  paymentService,
  inventoryService,
  shippingService,
} from "../../../../services/index.js";

export const add = async (req, res, next) => {
  try {
    const {
      currency = "INR",
      address_id,          // ✅ used to fetch the address
      payment_method,
      isDirectCheckout,
      coupon_code = null,
    } = req.body;
    // ⚠️ Shipping is NEVER trusted from the client — it is always computed
    // server-side below from the resolved address + cart contents.

    const user_id = req.auth?.user_id || null;
    const guest_id = req.auth?.guest_id || null;

    if (!user_id && !guest_id) {
      throw StatusError.unauthorized("Invalid access token.");
    }

    if (!address_id) {
      throw StatusError.badRequest("Delivery address is required.");
    }

    if (!payment_method) {
      throw StatusError.badRequest("Payment method is required.");
    }

    // ── Exchange Rate ────────────────────────────────────────────────────────
    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const exchangeRate = ratesDoc?.rates?.get(currency) ?? 1;

    // ── Fetch carts ──────────────────────────────────────────────────────────
    const carts = await (isDirectCheckout ? TempCart : Cart)
      .find({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      })
      .populate("product variation");

    if (!carts.length) {
      throw StatusError.badRequest("No items found in cart.");
    }

    // ── Build order items ────────────────────────────────────────────────────
    let total = 0;

    const items = carts
      .map((cart) => {
        const product = cart.product;
        const variation = cart.variation;
        if (!product) return null;

        const quantity = cart.quantity;
        const base_unit_price = parseFloat(cart.discounted_price ?? cart.price);
        const base_total_price = base_unit_price * quantity;
        const unit_price = parseFloat((base_unit_price * exchangeRate).toFixed(2));
        const total_price = parseFloat((base_total_price * exchangeRate).toFixed(2));

        total += total_price;

        const stockSource = variation || product;

        return {
          product_id: product._id,
          variation_id: variation?._id || null,
          customization_id: cart?.customization_id || null,
          quantity,
          unit_price,
          total_price,
          base_unit_price,
          base_total_price,
          shipping_class: stockSource.shipping_class || null,
          weight: stockSource.weight || 0,
          stock_quantity: stockSource.stock_quantity,
          status: stockSource.status,
          cart_ref: cart,
        };
      })
      .filter(Boolean);

    if (!items.length) {
      throw StatusError.badRequest("No valid products found in cart.");
    }

    // 🔹 Defensive re-check: bail if anything went out of stock between cart-add and checkout,
    // so we never confirm an order (or its delivery estimate) for unavailable items.
    const unavailableItem = items.find(
      (item) =>
        item.status === "inactive" ||
        (item.stock_quantity != null && item.stock_quantity < item.quantity)
    );
    if (unavailableItem) {
      throw StatusError.badRequest(
        "One or more items in your cart are no longer available in the requested quantity. Please review your cart."
      );
    }

    // ── User ─────────────────────────────────────────────────────────────────
    if (!user_id) {
      throw StatusError.unauthorized("Login required to place an order.");
    }

    const user = await User.findById(user_id);
    if (!user) throw StatusError.unauthorized("Invalid user session.");

    // ── Address — look up by address_id ──────────────────────────────────────
const address = await Address.findOne({
  _id: new mongoose.Types.ObjectId(address_id),
  user: user._id,
  deleted_at: null,
});

    if (!address) {
      throw StatusError.notFound("Address not found. Please select a valid delivery address.");
    }

    // ── Coupon ───────────────────────────────────────────────────────────────
    let discount = 0;

    if (coupon_code) {
      const couponData = await inventoryService.cartService.validateCoupon({
        code: coupon_code,
        user: { _id: user._id, role: user.role },
        carts,
        currency,
      });
      discount = couponData.discount;
    }

    const discountAmount = parseFloat(discount.toFixed(2));
    const sub_total = parseFloat(total.toFixed(2));

    // ── Shipping + estimated delivery — computed server-side, never client-supplied ──────────
    const rateResult = await shippingService.calculateShippingRate({
      items: items.map((item) => ({
        shipping_class: item.shipping_class,
        weight: item.weight,
        quantity: item.quantity,
      })),
      address: {
        country: address.country,
        state: address.state,
        postcode: address.postcode,
      },
      orderSubtotal: sub_total,
    });

    const shippingAmount = parseFloat(
      (rateResult.amount * exchangeRate).toFixed(2)
    );

    const deliveryEstimate = await shippingService.calculateDeliveryEstimate({
      min_delivery_days: rateResult.min_delivery_days,
      max_delivery_days: rateResult.max_delivery_days,
      isAvailable: true,
    });

    const grandTotal = parseFloat((sub_total - discountAmount + shippingAmount).toFixed(2));

    // ── Create order ─────────────────────────────────────────────────────────
    const order_id = `ORD-${Date.now()}`;

    const order = await Order.create({
      id: order_id,
      user: user._id,
      billing_address: address._id,
      shipping_address: address._id,
      payment_status: "pending",
      order_status: "pending",
      total_amount: sub_total,
      discount: discountAmount,
      shipping: shippingAmount,
      grand_total: grandTotal,
      currency,
      payment_method,
      transaction_id: `EXT-${order_id}`,
      note: "Checkout",
      exchange_rate: exchangeRate,
      total_items: items.length,
      coupon_code: coupon_code || null,
      etd: deliveryEstimate?.display || null,
    });

    // ── Order items ──────────────────────────────────────────────────────────
    const orderItems = items.map((item) => {
      const cart = item.cart_ref;
      return {
        order_id: order._id,
        product_id: item.product_id,
        variation_id: item.variation_id,
        customization_id: item.customization_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        regular_price: cart.price,
        sale_price: cart.discounted_price,
        discount_percent: cart.discount_percent ?? null,
        currency,
        exchange_rate: exchangeRate,
      };
    });

    await OrderItem.insertMany(orderItems);

    // ── Cart cleanup ─────────────────────────────────────────────────────────
    if (isDirectCheckout) {
      await TempCart.deleteMany({
        deleted_at: null,
        ...(user_id ? { user: user_id } : { guest_id }),
      });
    } else {
      await Cart.updateMany(
        {
          deleted_at: null,
          ...(user_id ? { user: user_id } : { guest_id }),
        },
        { deleted_at: new Date() }
      );
    }

    // ── Payment ──────────────────────────────────────────────────────────────
    let providerResponse = null;

    if (payment_method === "razorpay") {
      const razorpayOrder = await paymentService.createRazorpayOrder(
        grandTotal,
        currency,
        order_id,
      );

      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "razorpay",
            razorpay_order_id: razorpayOrder.id,
          },
        },
      );

      providerResponse = { provider: "razorpay", data: razorpayOrder };
    } else if (payment_method === "paypal") {
      const paypalResp = await paymentService.createPayPalOrder(
        grandTotal,
        currency,
        order_id,
        items,
      );

      await Order.findOneAndUpdate(
        { id: order_id },
        {
          payment_meta: {
            payment_provider: "paypal",
            paypal_order_id: paypalResp.paypalOrderId,
          },
        },
      );

      providerResponse = { provider: "paypal", data: paypalResp };
    }

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      status: "success",
      message: "Order placed successfully",
      data: {
        order,
        items: orderItems,
        providerResponse,
      },
    });
  } catch (error) {
    console.error("❌ Order creation failed:", error.message);
    next(error);
  }
};