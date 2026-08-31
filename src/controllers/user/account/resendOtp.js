import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { otpService } from "../../../services/index.js";

const PURPOSES = ["change_email", "change_mobile"];

/**
 * Resend an OTP for an in-progress change-email/change-mobile flow.
 * Cooldown/attempt protection is enforced by otpService.issueOtp itself
 * (same as the original request-change call).
 */
export const resendOtp = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const { purpose } = req.body;
    if (!PURPOSES.includes(purpose)) {
      throw StatusError.badRequest(req.__("Invalid or unsupported OTP purpose"));
    }

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    if (purpose === "change_email") {
      if (!user.pending_email) {
        throw StatusError.badRequest(req.__("No pending email change to resend an OTP for"));
      }
      await otpService.issueOtp({
        identifier: user.pending_email,
        purpose,
        email: user.pending_email,
        name: user.name,
        req,
      });
    } else {
      if (!user.pending_mobile) {
        throw StatusError.badRequest(req.__("No pending mobile change to resend an OTP for"));
      }
      const identifier = `${user.pending_phone_code || "91"}${user.pending_mobile}`;
      await otpService.issueOtp({
        identifier,
        purpose,
        mobile: user.pending_mobile,
        name: user.name,
        req,
      });
    }

    res.status(200).json({
      status: "success",
      message: req.__("OTP resent successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
