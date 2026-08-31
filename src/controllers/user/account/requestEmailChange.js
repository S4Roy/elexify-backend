import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { otpService } from "../../../services/index.js";
import { auditService } from "../../../services/index.js";

/**
 * Step 1 of the email-change flow: validate + reserve the new email as
 * `pending_email` and send an OTP to it. The currently-verified `email`
 * field is never touched here.
 */
export const requestEmailChange = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const email = (req.body.email || "").trim().toLowerCase();

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    if (user.email === email) {
      throw StatusError.badRequest(req.__("This is already your current email"));
    }

    const taken = await User.findOne({
      email,
      deleted_at: null,
      _id: { $ne: user_id },
    }).lean();
    if (taken) {
      // Generic message — never confirm/deny an account exists for this email.
      throw StatusError.badRequest(
        req.__("We're unable to use this email right now. Please try a different one.")
      );
    }

    // Issue the OTP before persisting pending_email — if delivery fails,
    // the user must not be left with a dangling pending_email that can
    // never be verified (no OTP was actually sent for it).
    await otpService.issueOtp({
      identifier: email,
      purpose: "change_email",
      email,
      name: user.name,
      req,
    });

    user.pending_email = email;
    await user.save();

    await auditService.recordAudit({ userId: user_id, event: "EMAIL_CHANGE_REQUESTED", req });

    res.status(200).json({
      status: "success",
      message: req.__("OTP sent to your new email address"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
