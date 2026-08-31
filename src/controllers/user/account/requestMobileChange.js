import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { otpService, auditService } from "../../../services/index.js";
import { normalizeMobile } from "../../../helpers/mobileHelper.js";

/**
 * Step 1 of the mobile-change flow: validate + reserve the new number as
 * `pending_mobile`/`pending_phone_code` and send an OTP to it. The
 * currently-verified `mobile` field is never touched here.
 */
export const requestMobileChange = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const phone_code = req.body.phone_code || "91";
    const normalizedMobile = normalizeMobile(req.body.mobile, phone_code);
    if (!normalizedMobile) {
      throw StatusError.badRequest(req.__("Invalid mobile number"));
    }

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    if (user.phone_code === phone_code && user.mobile === normalizedMobile) {
      throw StatusError.badRequest(req.__("This is already your current mobile number"));
    }

    const taken = await User.findOne({
      phone_code,
      mobile: normalizedMobile,
      deleted_at: null,
      _id: { $ne: user_id },
    }).lean();
    if (taken) {
      throw StatusError.badRequest(
        req.__("We're unable to use this mobile number right now. Please try a different one.")
      );
    }

    // Issue the OTP before persisting pending_mobile — if delivery fails,
    // the user must not be left with a dangling pending_mobile that can
    // never be verified (no OTP was actually sent for it).
    const identifier = `${phone_code}${normalizedMobile}`;
    await otpService.issueOtp({
      identifier,
      purpose: "change_mobile",
      mobile: normalizedMobile,
      name: user.name,
      req,
    });

    user.pending_mobile = normalizedMobile;
    user.pending_phone_code = phone_code;
    await user.save();

    await auditService.recordAudit({ userId: user_id, event: "MOBILE_CHANGE_REQUESTED", req });

    res.status(200).json({
      status: "success",
      message: req.__("OTP sent to your new mobile number"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
