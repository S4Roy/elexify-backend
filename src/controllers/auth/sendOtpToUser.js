import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import { StatusError } from "../../config/index.js";
import { smsService, emailService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";
import { envs } from "../../config/index.js";

const OTP_LENGTH = envs.otp.length || 6;
const OTP_EXPIRY_MINUTES = envs.otp.expiry_minutes || 5;
const OTP_RESEND_COOLDOWN_SECONDS = envs.otp.resend_interval_seconds || 60;

export const sendOtpToUser = async (req, res, next) => {
  try {
    const {
      phone_code,
      mobile,
      email,
      purpose = "auth",
      is_otp_login,
    } = req.body;

    // ── Validate: must provide email OR mobile ────────────────────────────────
    if (!email && !mobile) {
      throw StatusError.badRequest(
        req.__("Email or mobile number is required"),
      );
    }

    const isEmailMode = !!email;
    const identifier = isEmailMode
      ? email.trim().toLowerCase()
      : `${phone_code ?? "91"}${mobile.trim()}`;

    // ── Find or detect user (no 404 — allow new user signup via OTP) ─────────
    let user = null;
    if (isEmailMode) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      }).lean();
    } else {
      user = await User.findOne({
        phone_code: phone_code ?? "91",
        mobile: mobile.trim(),
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      }).lean();
    }

    const isExistingUser = !!user;

    // ── Rate limit — cooldown check ───────────────────────────────────────────
    const lastOtp = await OtpVerification.findOne({
      identifier,
      purpose,
      verified_at: null,
      expired_at: null,
    }).sort({ created_at: -1 });

    if (lastOtp) {
      const secondsPassed = moment().diff(
        moment(lastOtp.created_at),
        "seconds",
      );
      const secondsLeft = OTP_RESEND_COOLDOWN_SECONDS - secondsPassed;
      if (secondsLeft > 0) {
        throw StatusError.tooManyRequests(
          req.__(
            "Please wait {{seconds}} seconds before requesting another OTP",
            { seconds: secondsLeft },
          ),
        );
      }
    }

    // ── Generate & hash OTP ───────────────────────────────────────────────────
    const otp = generalHelper.generateOtp(OTP_LENGTH);
    const hashedOtp = await generalHelper.bcryptMake(otp);

    // ── Invalidate previous OTPs for this identifier ──────────────────────────
    await OtpVerification.updateMany(
      { identifier, purpose, verified_at: null },
      { expired_at: moment().toDate() },
    );

    // ── Save new OTP ──────────────────────────────────────────────────────────
    await OtpVerification.create({
      email: isEmailMode ? email.trim().toLowerCase() : null,
      mobile: isEmailMode ? null : `${phone_code}${mobile.trim()}`,
      otp: hashedOtp,
      purpose,
      expires_at: moment().add(OTP_EXPIRY_MINUTES, "minutes").toDate(),
      meta: { ip: req.ip, user_agent: req.headers["user-agent"] },
    });

    // ── Deliver OTP ───────────────────────────────────────────────────────────
    if (isEmailMode) {
      // Email OTP
      const emailResponse = await emailService.sendEmail(
        email,
        "otp",
        "YOUR OTP CODE",
        "en",
        {
          name: user?.name ?? "User",
          otp,
          expiry: OTP_EXPIRY_MINUTES,
          purpose:
            purpose === "auth"
              ? is_otp_login
                ? "Login"
                : "Authentication"
              : purpose === "signup"
                ? "Sign Up"
                : purpose === "forgot_password"
                  ? "Forgot Password"
                  : purpose === "reset_password"
                    ? "Reset Password"
                    : purpose,
        },
      );
      console.log(emailResponse);

      if (!emailResponse) {
        await OtpVerification.deleteMany({
          identifier,
          purpose,
          verified_at: null,
        });
        throw StatusError.badRequest(
          req.__(
            emailResponse?.error?.message ||
              "Failed to send OTP email. Please try again.",
          ),
        );
      }
    } else {
      // SMS OTP
      const smsResponse = await smsService.sendSMS({
        to: identifier,
        message: "189215",
        variables: [user?.name ?? "User", purpose, otp],
      });

      if (smsResponse?.success === false) {
        await OtpVerification.deleteMany({
          email: isEmailMode ? email.trim().toLowerCase() : null,
          mobile: isEmailMode ? null : `${phone_code}${mobile.trim()}`,
          purpose,
          verified_at: null,
        });
        throw StatusError.badRequest(
          req.__(
            smsResponse?.error?.message ||
              "Failed to send OTP. Please try again later.",
          ),
        );
      }
    }

    // ── Response ──────────────────────────────────────────────────────────────
    return res.status(200).json({
      status: "success",
      message: req.__("OTP sent successfully"),
      data: {
        is_existing_user: isExistingUser,
        is_email: isEmailMode,
        purpose,
        is_otp_login: !!is_otp_login,
      },
    });
  } catch (error) {
    next(error);
  }
};
