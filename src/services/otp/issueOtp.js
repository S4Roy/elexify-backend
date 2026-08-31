import moment from "moment";
import OtpVerification from "../../models/OtpVerification.js";
import { StatusError, envs } from "../../config/index.js";
import { emailService, smsService } from "../index.js";
import { generalHelper } from "../../helpers/index.js";

const OTP_LENGTH = envs.otp.length || 6;
const OTP_EXPIRY_MINUTES = envs.otp.expiry_minutes || 5;
const OTP_RESEND_COOLDOWN_SECONDS = envs.otp.resend_interval_seconds || 60;

/**
 * issueOtp — shared OTP generation/delivery used by the change-email and
 * change-mobile flows (and their resend endpoint). Mirrors the
 * cooldown/hash/invalidate-previous pattern already used by
 * controllers/auth/sendOtpToUser.js for login/signup OTPs.
 *
 * @param {object} params
 * @param {string} params.identifier - unique lookup key for this OTP (email, or phone_code+mobile)
 * @param {string} params.purpose - one of OtpVerification's purpose enum values
 * @param {string} [params.email] - set for email-channel OTPs
 * @param {string} [params.mobile] - set for mobile-channel OTPs
 * @param {string} [params.name] - recipient display name for the template
 * @param {object} [params.req] - originating request, for ip/user_agent meta only
 * @returns {{seconds_left_before_next_resend: number}}
 */
export const issueOtp = async ({ identifier, purpose, email, mobile, name, req }) => {
  const isEmailMode = !!email;

  const lastOtp = await OtpVerification.findOne({
    identifier,
    purpose,
    verified_at: null,
    expired_at: null,
  }).sort({ created_at: -1 });

  if (lastOtp) {
    const secondsPassed = moment().diff(moment(lastOtp.created_at), "seconds");
    const secondsLeft = OTP_RESEND_COOLDOWN_SECONDS - secondsPassed;
    if (secondsLeft > 0) {
      throw StatusError.tooManyRequests(
        `Please wait ${secondsLeft} seconds before requesting another OTP`
      );
    }
  }

  const otp = generalHelper.generateOtp(OTP_LENGTH);
  const hashedOtp = await generalHelper.bcryptMake(otp);

  await OtpVerification.updateMany(
    { identifier, purpose, verified_at: null },
    { expired_at: moment().toDate() }
  );

  await OtpVerification.create({
    identifier,
    ...(isEmailMode ? { email } : { mobile }),
    otp: hashedOtp,
    purpose,
    expires_at: moment().add(OTP_EXPIRY_MINUTES, "minutes").toDate(),
    meta: { ip: req?.ip, user_agent: req?.headers?.["user-agent"] },
  });

  if (isEmailMode) {
    const delivered = await emailService.sendEmail(email, "otp", "YOUR OTP CODE", "en", {
      name: name || "User",
      otp,
      expiry: OTP_EXPIRY_MINUTES,
      purpose,
    });
    if (!delivered) {
      await OtpVerification.deleteMany({ identifier, purpose, verified_at: null });
      throw StatusError.badRequest("Failed to send OTP email. Please try again.");
    }
  } else {
    const result = await smsService.sendSMS({
      to: identifier,
      message: "189215",
      variables: [name || "User", purpose, otp],
    });
    if (result?.success === false) {
      await OtpVerification.deleteMany({ identifier, purpose, verified_at: null });
      throw StatusError.badRequest("Failed to send OTP. Please try again later.");
    }
  }

  return { expiry_minutes: OTP_EXPIRY_MINUTES };
};
