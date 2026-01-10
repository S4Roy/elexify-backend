import Coupon from "../../../../models/Coupon.js";
import { StatusError } from "../../../../config/index.js";
import CouponResource from "../../../../resources/CouponResource.js";

/**
 * Add Coupon
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      code,
      title,
      description = null,

      discount_type,
      discount_value,
      max_discount_amount,
      min_cart_value = 0,

      applicable_for,
      applicable_scope = "all",

      applicable_products = [],
      applicable_variations = [],
      applicable_categories = [],
      applicable_brands = [],

      usage_limit = null,
      usage_per_email = 1,
      single_use_per_order = true,

      start_date,
      end_date,

      exclude_sale_items = false,
      exclude_ask_for_price = true,
      exclude_enquiry_products = true,

      status = "active",
    } = req.body;

    /* =========================
       DUPLICATE CODE CHECK
    ========================== */
    const existingCoupon = await Coupon.findOne({
      code: code.toUpperCase(),
      deleted_at: null,
    });

    if (existingCoupon) {
      throw StatusError.conflict(req.__("Coupon code already exists"));
    }

    /* =========================
       CREATE COUPON
    ========================== */
    const coupon = new Coupon({
      code: code.toUpperCase(),
      title,
      description,

      discount_type,
      discount_value,
      max_discount_amount,
      min_cart_value,

      applicable_for,
      applicable_scope,

      applicable_products,
      applicable_variations,
      applicable_categories,
      applicable_brands,

      usage_limit,
      usage_per_email,
      single_use_per_order,

      start_date,
      end_date,

      exclude_sale_items,
      exclude_ask_for_price,
      exclude_enquiry_products,

      status,

      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    await coupon.save();

    /* =========================
       SUCCESS RESPONSE
    ========================== */
    res.status(201).json({
      status: "success",
      message: req.__("Coupon added successfully"),
      data: new CouponResource(coupon).exec(),
    });
  } catch (error) {
    next(error);
  }
};
