import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import {
  otpService,
  notificationService,
  auditService,
  emailService,
} from "../../../services/index.js";

/**
 * Step 2 of the email-change flow: verify the OTP sent to `pending_email`
 * and only then promote it to the verified `email` field.
 */
export const verifyEmailChange = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const { otp } = req.body;

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    if (!user.pending_email) {
      throw StatusError.badRequest(req.__("No pending email change to verify"));
    }

    await otpService.verifyOtpForIdentifier({
      identifier: user.pending_email,
      purpose: "change_email",
      otp,
    });

    const oldEmail = user.email;
    const newEmail = user.pending_email;

    user.email = newEmail;
    user.email_verified_at = new Date();
    user.pending_email = null;
    user.updated_by = user_id;
    user.updated_at = Date.now();
    await user.save();

    await auditService.recordAudit({ userId: user_id, event: "EMAIL_CHANGED", req });

    // Best-effort security notifications — must not fail the change itself.
    // "new email verified" goes through the preference-aware notification
    // service (targets the now-current user.email); the old-address
    // "your email was changed" notice is sent directly since it's no
    // longer the user's contact channel on record.
    notificationService
      .sendNotification({ userId: user_id, event: "EMAIL_CHANGED", data: { old_email: oldEmail, new_email: newEmail } })
      .catch(() => {});

    if (oldEmail) {
      emailService
        .sendEmail(oldEmail, "email_changed", "Your account email was changed", "en", {
          name: user.name,
        })
        .catch(() => {});
    }

    res.status(200).json({
      status: "success",
      message: req.__("Email updated and verified successfully"),
      data: { email: user.email },
    });
  } catch (error) {
    next(error);
  }
};
