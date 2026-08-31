import moment from "moment";
import OtpVerification from "../../models/OtpVerification.js";
import { StatusError, envs } from "../../config/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * verifyOtpForIdentifier — shared OTP verification used by the change-email
 * and change-mobile flows. Same atomic-consume/attempt-guard pattern as
 * controllers/auth/verifyUserOtp.js, factored out for reuse.
 *
 * Throws a StatusError on any failure (not found/expired/invalid/locked).
 * @returns the consumed OtpVerification document on success.
 */
export const verifyOtpForIdentifier = async ({ identifier, purpose, otp }) => {
  const otpRecord = await OtpVerification.findOne({
    identifier,
    purpose,
    verified_at: null,
    expired_at: null,
    attempts: { $lt: envs.otp.max_attempts },
  }).sort({ created_at: -1 });

  if (!otpRecord) {
    throw StatusError.badRequest("OTP not found or already used");
  }

  if (moment().isAfter(moment(otpRecord.expires_at))) {
    await otpRecord.updateOne({ expired_at: new Date() });
    throw StatusError.badRequest("OTP has expired");
  }

  const isOtpValid = await generalHelper.bcryptCheck(otp, otpRecord.otp);
  if (!isOtpValid) {
    const failed = await OtpVerification.findOneAndUpdate(
      {
        _id: otpRecord._id,
        verified_at: null,
        expired_at: null,
        attempts: { $lt: envs.otp.max_attempts },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!failed || failed.attempts >= envs.otp.max_attempts) {
      await OtpVerification.updateOne(
        { _id: otpRecord._id, verified_at: null },
        { $set: { expired_at: new Date() } }
      );
      throw StatusError.tooManyRequests("OTP attempt limit exceeded. Request a new code.");
    }
    throw StatusError.badRequest("Invalid OTP");
  }

  const consumed = await OtpVerification.findOneAndUpdate(
    { _id: otpRecord._id, verified_at: null, expired_at: null },
    { $set: { verified_at: new Date() } },
    { new: true }
  );
  if (!consumed) throw StatusError.badRequest("OTP already used or expired");

  return consumed;
};
