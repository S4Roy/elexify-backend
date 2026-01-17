import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import { StatusError } from "../../config/index.js";
import { smsService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";
import { envs } from "../../config/index.js";

const OTP_LENGTH = envs.otp.length || 6;
const OTP_EXPIRY_MINUTES = envs.otp.expiry_minutes || 5;
const OTP_RESEND_COOLDOWN_SECONDS = envs.otp.resend_interval_seconds || 60;

export const sendOtpToUser = async (req, res, next) => {
  try {
    const { phone_code, phone_number } = req.body;

    /* =========================
       Normalize Phone
    ========================== */
    const mobile = `${phone_code}${phone_number}`;

    /* =========================
       Validate User
    ========================== */
    const user = await User.findOne({
      phone_code,
      mobile: phone_number,
      deleted_at: null,
      role: { $in: ["user", "customer"] },
    }).lean();

    if (!user) {
      throw StatusError.notFound(
        req.__("User with this phone number not found")
      );
    }

    /* =========================
   Rate Limit (Cooldown)
========================== */
    const lastOtp = await OtpVerification.findOne({
      mobile,
      purpose: "login",
      verified_at: null,
    }).sort({ created_at: -1 });

    if (lastOtp) {
      const secondsPassed = moment().diff(
        moment(lastOtp.created_at),
        "seconds"
      );

      const secondsLeft = OTP_RESEND_COOLDOWN_SECONDS - secondsPassed;

      if (secondsLeft > 0) {
        throw StatusError.tooManyRequests(
          req.__(
            "Please wait {{seconds}} seconds before requesting another OTP",
            { seconds: secondsLeft }
          )
        );
      }
    }

    /* =========================
       Generate & Hash OTP
    ========================== */
    const otp = generalHelper.generateOtp(OTP_LENGTH);

    const hashedOtp = await generalHelper.bcryptMake(otp);

    /* =========================
       Invalidate Previous OTPs
    ========================== */
    await OtpVerification.updateMany(
      {
        mobile,
        purpose: "login",
        verified_at: null,
      },
      { expired_at: moment().toDate() }
    );

    /* =========================
       Save OTP
    ========================== */
    await OtpVerification.create({
      mobile,
      otp: hashedOtp,
      purpose: "login",
      expires_at: moment().add(OTP_EXPIRY_MINUTES, "minutes").toDate(),
      meta: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
      },
    });

    /* =========================
       Send SMS
    ========================== */
    const smsResponse = await smsService.sendSMS({
      to: mobile,
      message: "189215",
      variables: [user.name, "Login", otp],
    });

    if (smsResponse.success === false) {
      console.error("SMS sending failed:", smsResponse);
      //   clean up OTP on failure
      await OtpVerification.deleteMany({
        mobile,
        purpose: "login",
        verified_at: null,
      });
      throw StatusError.badRequest(
        req.__(
          smsResponse?.error?.message ||
            "Failed to send OTP. Please try again later."
        )
      );
    }
    /* =========================
       Response (No User Leak)
    ========================== */
    return res.status(200).json({
      status: "success",
      message: req.__("OTP sent successfully"),
    });
  } catch (error) {
    next(error);
  }
};
