import Coupon from "../../../models/Coupon.js";
import User from "../../../models/User.js";
import CouponUsage from "../../../models/CouponUsage.js";
import ExchangeRate from "../../../models/ExchangeRate.js";
import { StatusError } from "../../../config/index.js";
import mongoose from "mongoose";

export const validateCoupon = async ({
  code,
  user,
  carts = [],
  currency = "INR",
}) => {
  if (!code) {
    throw StatusError.badRequest("Coupon code is required");
  }

  if (!carts.length) {
    throw StatusError.badRequest("Cart is empty");
  }

  /* =========================
     FETCH COUPON
  ========================== */
  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    status: "active",
    deleted_at: null,
    start_date: { $lte: new Date() },
    end_date: { $gte: new Date() },
  }).lean();

  if (!coupon) {
    throw StatusError.badRequest("Invalid or expired coupon");
  }
  /* =========================
     GLOBAL USAGE LIMIT
  ========================== */
  if (coupon.usage_limit !== null && coupon.total_used >= coupon.usage_limit) {
    throw StatusError.badRequest("Coupon usage limit reached");
  }

  const userId = user?._id ? user._id.toString() : null;
  let userData = null;
  if (userId) {
    userData = await User.findById(userId).lean();
  }
  /* =========================
     PER EMAIL LIMIT
  ========================== */
  const email = userData?.email?.toLowerCase();
  if (!email) {
    throw StatusError.badRequest("Email required to apply coupon");
  }

  const usedCount = await CouponUsage.countDocuments({
    coupon: coupon._id,
    email,
    status: "applied",
  });

  if (usedCount >= coupon.usage_per_email) {
    throw StatusError.badRequest("Coupon already used");
  }
  /* =========================
     USER ELIGIBILITY
  ========================== */
  if (coupon.applicable_for !== "both") {
    if (!user) {
      throw StatusError.badRequest("Login required to apply this coupon");
    }

    if (coupon.applicable_for === "user" && user.role !== "customer") {
      throw StatusError.badRequest("Coupon not applicable for this user");
    }

    if (
      coupon.applicable_for === "channel_partner" &&
      user.role !== "channel_partner"
    ) {
      throw StatusError.badRequest("Coupon not applicable for this user");
    }
  }

  /* =========================
     EXCHANGE RATE
  ========================== */
  const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
  const rate = ratesDoc?.rates?.get(currency) ?? 1;

  /* =========================
     CART ITERATION
  ========================== */
  let eligibleSubtotalINR = 0;
  let cartSubtotalINR = 0;

  for (const item of carts) {
    const quantity = item.quantity;
    const unitPrice = Number(item.price);
    const lineTotal = unitPrice * quantity;

    cartSubtotalINR += lineTotal;

    let eligible = false;

    switch (coupon.applicable_scope) {
      case "all":
        eligible = true;
        break;

      case "product":
        eligible = coupon.applicable_products?.some(
          (id) => id.toString() === item.product?._id.toString()
        );
        break;

      case "variation":
        eligible = coupon.applicable_variations?.some(
          (id) => id.toString() === item.variation?._id?.toString()
        );
        break;

      case "brand":
        eligible = coupon.applicable_brands?.some(
          (id) => id.toString() === item.product?.brand?.toString()
        );
        break;

      case "category":
        eligible = coupon.applicable_categories?.some((catId) =>
          item.product?.categories?.some(
            (c) => c.toString() === catId.toString()
          )
        );
        break;
    }

    /* =========================
       EXCLUSIONS
    ========================== */
    if (eligible) {
      if (coupon.exclude_sale_items && item.product?.sale_price > 0) {
        eligible = false;
      }

      if (coupon.exclude_ask_for_price && item.product?.ask_for_price) {
        eligible = false;
      }

      if (coupon.exclude_enquiry_products && item.product?.enable_enquiry) {
        eligible = false;
      }
    }

    if (eligible) {
      eligibleSubtotalINR += lineTotal;
    }
  }

  if (eligibleSubtotalINR <= 0) {
    throw StatusError.badRequest(
      "Coupon is not applicable to selected products"
    );
  }

  /* =========================
     MIN CART VALUE
  ========================== */
  if (coupon.min_cart_value > eligibleSubtotalINR) {
    throw StatusError.badRequest(
      `Minimum cart value ₹${coupon.min_cart_value} required`
    );
  }

  /* =========================
     DISCOUNT CALCULATION
  ========================== */
  let discountINR = 0;

  if (coupon.discount_type === "percentage") {
    discountINR = (eligibleSubtotalINR * coupon.discount_value) / 100;

    if (coupon.max_discount_amount) {
      discountINR = Math.min(discountINR, coupon.max_discount_amount);
    }
  } else {
    discountINR = coupon.discount_value;
  }

  /* =========================
     MULTICURRENCY
  ========================== */
  const discountConverted = Number((discountINR * rate).toFixed(2));
  const subtotalConverted = Number((cartSubtotalINR * rate).toFixed(2));
  const totalConverted = Number(
    (subtotalConverted - discountConverted).toFixed(2)
  );

  return {
    coupon,
    discount: discountConverted,
    subtotal: subtotalConverted,
    total: totalConverted,
    eligible_subtotal: eligibleSubtotalINR * rate,
    currency,
    exchange_rate: rate,
  };
};
