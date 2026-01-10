import Coupon from "../../../../models/Coupon.js";
import { StatusError } from "../../../../config/index.js";
import CouponResource from "../../../../resources/CouponResource.js";

/**
 * Remove Coupon (Soft Delete)
 * @param req
 * @param res
 * @param next
 */
export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Coupon ID is required"));
    }

    /* =========================
       FIND COUPON
    ========================== */
    const coupon = await Coupon.findOne({
      _id,
      deleted_at: null,
    }).exec();

    if (!coupon) {
      throw StatusError.notFound(req.__("Coupon not found"));
    }

    /* =========================
       OPTIONAL SAFETY CHECKS
       (Business Rules)
    ========================== */
    // Example: prevent deleting active coupons
    // if (coupon.status === "active") {
    //   throw StatusError.badRequest(
    //     req.__("Active coupon cannot be deleted")
    //   );
    // }

    /* =========================
       SOFT DELETE
    ========================== */
    const updateData = {
      deleted_at: new Date(),
      deleted_by: req.auth.user_id,
      status: "inactive",
    };

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    /* =========================
       RESPONSE
    ========================== */
    res.status(200).json({
      status: "success",
      message: req.__("Coupon deleted successfully"),
      data: new CouponResource(updatedCoupon).exec(),
    });
  } catch (error) {
    next(error);
  }
};
