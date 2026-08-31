import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";
import { notificationService } from "../../../services/index.js";

/**
 * Edit User profile (partial update).
 *
 * Email/mobile are intentionally NOT editable here — they can only change
 * via the OTP-gated requestEmailChange/verifyEmailChange and
 * requestMobileChange/verifyMobileChange flows, so a verified contact can
 * never be silently overwritten.
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { first_name, last_name, dob, gender, profile_image, password, current_password } =
      req.body;

    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const user = await User.findOne({
      _id: user_id,
      deleted_at: null,
    });

    if (!user) throw StatusError.notFound("Profile not found");

    if (first_name || last_name) {
      const [existingFirst, ...existingRest] = user.name.trim().split(" ");
      const nextFirst = first_name?.trim() || existingFirst;
      const nextLast = last_name?.trim() ?? existingRest.join(" ");
      user.name = [nextFirst, nextLast].filter(Boolean).join(" ");
    }

    if (dob !== undefined) user.dob = dob || null;
    if (gender !== undefined) user.gender = gender || null;
    if (profile_image !== undefined) user.profile_image = profile_image || null;

    if (password) {
      if (!user.password || !current_password) {
        throw StatusError.badRequest(
          req.__("Current password is required to set a new password")
        );
      }
      const isCurrentValid = await generalHelper.bcryptCheck(
        current_password,
        user.password
      );
      if (!isCurrentValid) {
        throw StatusError.badRequest(req.__("Current password is incorrect"));
      }
      user.password = await generalHelper.bcryptMake(password);
    }

    user.updated_by = user_id;
    user.updated_at = Date.now();

    await user.save();

    if (password) {
      notificationService
        .sendNotification({ userId: user_id, event: "PASSWORD_CHANGED", data: {} })
        .catch(() => {});
    }

    res.status(200).json({
      status: "success",
      message: req.__("Profile updated successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
