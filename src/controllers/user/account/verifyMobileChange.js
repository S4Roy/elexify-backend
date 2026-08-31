import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import {
  otpService,
  notificationService,
  auditService,
} from "../../../services/index.js";

/**
 * Step 2 of the mobile-change flow: verify the OTP sent to
 * `pending_mobile` and only then promote it to the verified `mobile` field.
 */
export const verifyMobileChange = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const { otp } = req.body;

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    if (!user.pending_mobile) {
      throw StatusError.badRequest(req.__("No pending mobile change to verify"));
    }

    const identifier = `${user.pending_phone_code || "91"}${user.pending_mobile}`;
    await otpService.verifyOtpForIdentifier({
      identifier,
      purpose: "change_mobile",
      otp,
    });

    const oldMobile = user.mobile;
    const oldPhoneCode = user.phone_code;

    user.mobile = user.pending_mobile;
    user.phone_code = user.pending_phone_code;
    user.mobile_verified_at = new Date();
    user.pending_mobile = null;
    user.pending_phone_code = null;
    user.updated_by = user_id;
    user.updated_at = Date.now();
    await user.save();

    await auditService.recordAudit({ userId: user_id, event: "MOBILE_CHANGED", req });

    // "mobile changed" alert to the new number goes through the
    // preference-aware notification service. There's no pre-approved DLT
    // SMS template for a generic "your mobile was changed" alert to the
    // *old* number, so — unlike the email flow — no SMS is sent to
    // `oldMobile` here; a security-alert DLT template can be wired in once
    // one exists.
    notificationService
      .sendNotification({ userId: user_id, event: "MOBILE_CHANGED", data: {} })
      .catch(() => {});

    res.status(200).json({
      status: "success",
      message: req.__("Mobile number updated and verified successfully"),
      data: { mobile: user.mobile, phone_code: user.phone_code },
    });
  } catch (error) {
    next(error);
  }
};
