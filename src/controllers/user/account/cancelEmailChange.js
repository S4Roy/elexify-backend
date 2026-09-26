import User from "../../../models/User.js";
import OtpVerification from "../../../models/OtpVerification.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";

/** Discard an unverified email change without affecting the current email. */
export const cancelEmailChange = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id;
    if (!user_id) throw StatusError.unauthorized("Invalid access token.");

    const user = await User.findOne({ _id: user_id, deleted_at: null });
    if (!user) throw StatusError.notFound("Profile not found");

    const pendingEmail = user.pending_email;
    if (pendingEmail) {
      await OtpVerification.deleteMany({
        identifier: pendingEmail,
        purpose: "change_email",
        verified_at: null,
      });
      user.pending_email = null;
      user.updated_by = user_id;
      user.updated_at = Date.now();
      await user.save();
      await auditService.recordAudit({ userId: user_id, event: "EMAIL_CHANGE_CANCELLED", req });
    }

    res.status(200).json({
      status: "success",
      message: req.__("Pending email change cancelled"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
