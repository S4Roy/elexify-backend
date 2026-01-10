import Coupon from "../../../../models/Coupon.js";
import { StatusError } from "../../../../config/index.js";
import CouponResource from "../../../../resources/CouponResource.js";

/**
 * Edit Coupon
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,

      code,
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
    } = req.body;

    /* =========================
       VALIDATE ID
    ========================== */
    if (!_id) {
      throw StatusError.badRequest(req.__("Coupon ID is required"));
    }

    const coupon = await Coupon.findOne({
      _id,
      deleted_at: null,
    }).exec();

    if (!coupon) {
      throw StatusError.notFound(req.__("Coupon not found"));
    }

    /* =========================
       PREVENT DUPLICATE CODE
    ========================== */
    if (code && code.toUpperCase() !== coupon.code) {
      const exists = await Coupon.exists({
        code: code.toUpperCase(),
        _id: { $ne: _id },
        deleted_at: null,
      });

      if (exists) {
        throw StatusError.conflict(req.__("Coupon code already exists"));
      }
    }

    /* =========================
       DATE SAFETY (OPTIONAL)
    ========================== */
    if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
      throw StatusError.badRequest(req.__("End date must be after start date"));
    }

    /* =========================
       BUILD UPDATE PAYLOAD
    ========================== */
    const updateData = {
      ...(code && { code: code.toUpperCase() }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),

      ...(discount_type && { discount_type }),
      ...(discount_value !== undefined && { discount_value }),
      ...(max_discount_amount !== undefined && {
        max_discount_amount,
      }),
      ...(min_cart_value !== undefined && { min_cart_value }),

      ...(applicable_for && { applicable_for }),
      ...(applicable_scope && { applicable_scope }),

      ...(Array.isArray(applicable_products) && {
        applicable_products,
      }),
      ...(Array.isArray(applicable_variations) && {
        applicable_variations,
      }),
      ...(Array.isArray(applicable_categories) && {
        applicable_categories,
      }),
      ...(Array.isArray(applicable_brands) && {
        applicable_brands,
      }),

      ...(usage_limit !== undefined && { usage_limit }),
      ...(usage_per_email !== undefined && { usage_per_email }),
      ...(single_use_per_order !== undefined && {
        single_use_per_order,
      }),

      ...(start_date && { start_date }),
      ...(end_date && { end_date }),

      ...(exclude_sale_items !== undefined && {
        exclude_sale_items,
      }),
      ...(exclude_ask_for_price !== undefined && {
        exclude_ask_for_price,
      }),
      ...(exclude_enquiry_products !== undefined && {
        exclude_enquiry_products,
      }),

      ...(status && { status }),

      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    /* =========================
       UPDATE COUPON
    ========================== */
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    /* =========================
       RESPONSE
    ========================== */
    return res.status(200).json({
      status: "success",
      message: req.__("Coupon updated successfully"),
      data: new CouponResource(updatedCoupon).exec(),
    });
  } catch (error) {
    next(error);
  }
};
