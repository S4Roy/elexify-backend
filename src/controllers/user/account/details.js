import mongoose from "mongoose";
import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Get User profile + verification status
 * @param req
 * @param res
 * @param next
 */
export const details = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;
    const user = await User.findOne({
      _id: new mongoose.Types.ObjectId(user_id),
      deleted_at: null,
    });
    if (!user) {
      throw new StatusError(404, "Details not found");
    }
    const [first_name, ...rest] = user.name.trim().split(" ");
    const last_name = rest.join(" ") || "";

    res.status(200).json({
      status: "success",
      message: req.__("Details fetched successfully"),
      data: {
        email: user.email,
        first_name,
        last_name,
        phone_code: user.phone_code,
        mobile: user.mobile,
        dob: user.dob,
        gender: user.gender,
        profile_image: user.profile_image,
        email_verified: !!user.email_verified_at,
        mobile_verified: !!user.mobile_verified_at,
        pending_email: user.pending_email
          ? generalHelper.maskEmail(user.pending_email)
          : null,
        pending_mobile: user.pending_mobile
          ? generalHelper.maskMobile(user.pending_mobile, user.pending_phone_code)
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
