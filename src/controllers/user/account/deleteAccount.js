import User from "../../../models/User.js";
import { StatusError } from "../../../config/index.js";
import { otpService, auditService, userService } from "../../../services/index.js";
import { generalHelper } from "../../../helpers/index.js";

// Self-service account deletion, confirmed with an OTP sent to the
// account's own verified contact. The work itself lives in
// services/user/accountDeletion.js.

const PURPOSE = "delete_account";

// Where the confirmation code goes: the verified mobile first (it's how most
// customers sign in), else the verified email, else whichever exists.
function otpChannel(user) {
  const sms = user.mobile && {
    channel: "sms",
    identifier: `${user.phone_code || "91"}${user.mobile}`,
    mobile: user.mobile,
    destination: generalHelper.maskMobile(user.mobile, user.phone_code || "91"),
  };
  const email = user.email && {
    channel: "email",
    identifier: user.email,
    email: user.email,
    destination: generalHelper.maskEmail(user.email),
  };
  if (user.mobile_verified_at && sms) return sms;
  if (user.email_verified_at && email) return email;
  return sms || email || null;
}

async function loadUser(req) {
  const user_id = req.auth?.user_id;
  if (!user_id) throw StatusError.unauthorized("Invalid access token.");
  const user = await User.findOne({ _id: user_id, deleted_at: null });
  if (!user) throw StatusError.notFound("Profile not found");
  return user;
}

/** GET /user/account/delete — can this account be deleted, and how. */
export const deletionStatus = async (req, res, next) => {
  try {
    const user = await loadUser(req);
    const blockers = await userService.deletionBlockers(user._id);
    const channel = otpChannel(user);
    res.status(200).json({
      status: "success",
      message: req.__("Account deletion status"),
      data: {
        can_delete: blockers.length === 0 && !!channel,
        blockers,
        otp_channel: channel?.channel ?? null,
        otp_destination: channel?.destination ?? null,
        reasons: userService.DELETION_REASONS,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** POST /user/account/delete/request — send the confirmation code. */
export const requestAccountDeletion = async (req, res, next) => {
  try {
    const user = await loadUser(req);
    const [blocker] = await userService.deletionBlockers(user._id);
    if (blocker) throw StatusError.conflict(blocker.message);

    const channel = otpChannel(user);
    if (!channel) {
      throw StatusError.badRequest(
        req.__("Add a mobile number or email to your account so we can confirm it's you."),
      );
    }
    const { expiry_minutes } = await otpService.issueOtp({
      identifier: channel.identifier,
      purpose: PURPOSE,
      email: channel.email,
      mobile: channel.mobile,
      name: user.name,
      req,
    });

    await auditService.recordAudit({ userId: user._id, event: "ACCOUNT_DELETION_REQUESTED", req });

    res.status(200).json({
      status: "success",
      message:
        channel.channel === "sms"
          ? req.__("We've sent a code to your mobile number")
          : req.__("We've sent a code to your email"),
      data: { otp_channel: channel.channel, otp_destination: channel.destination, expiry_minutes },
    });
  } catch (error) {
    next(error);
  }
};

/** POST /user/account/delete/confirm — verify the code and delete. */
export const confirmAccountDeletion = async (req, res, next) => {
  try {
    const user = await loadUser(req);
    const { otp, reason } = req.body;

    const channel = otpChannel(user);
    if (!channel) throw StatusError.badRequest(req.__("Request a new code and try again."));

    // Checked again: an order could have been placed since the code was sent.
    const [blocker] = await userService.deletionBlockers(user._id);
    if (blocker) throw StatusError.conflict(blocker.message);

    await otpService.verifyOtpForIdentifier({ identifier: channel.identifier, purpose: PURPOSE, otp });

    const deleted = await userService.deleteCustomerAccount({ userId: user._id, reason: reason || null });
    if (deleted) {
      await auditService.recordAudit({
        userId: user._id,
        event: "ACCOUNT_DELETED",
        req,
        metadata: reason ? { reason } : null,
      });
    }

    res.status(200).json({
      status: "success",
      message: req.__("Your account has been deleted"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
