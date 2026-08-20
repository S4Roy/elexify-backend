import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import { StatusError } from "../../config/index.js";
import { smsService, emailService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";
import { normalizeMobile } from "../../helpers/mobileHelper.js";
import { envs } from "../../config/index.js";

const OTP_LENGTH = envs.otp.length || 6;
const OTP_EXPIRY_MINUTES = envs.otp.expiry_minutes || 5;
const OTP_RESEND_COOLDOWN_SECONDS = envs.otp.resend_interval_seconds || 60;

const getPurposeLabel = (purpose, isExistingUser) => {
  switch (purpose) {
    case "auth":
      return isExistingUser ? "Login" : "Sign Up";
    case "signup":
      return "Sign Up";
    case "forgot_password":
      return "Forgot Password";
    case "reset_password":
      return "Reset Password";
    default:
      return purpose;
  }
};

export const sendOtpToUser = async (req, res, next) => {
  try {
    const { phone_code, mobile, email, purpose = "auth" } = req.body;

    if (!email && !mobile) {
      throw StatusError.badRequest(
        req.__("Email or mobile number is required"),
      );
    }

    const isEmailMode = !!email;

    // ── Normalize + validate mobile (strip +/country code/spaces) ────────────
    let normalizedMobile = null;
    const normalizedPhoneCode = phone_code ?? "91";
    if (!isEmailMode) {
      normalizedMobile = normalizeMobile(mobile, normalizedPhoneCode);
      if (!normalizedMobile) {
        throw StatusError.badRequest(req.__("Invalid mobile number"));
      }
    }

    const identifier = isEmailMode
      ? email.trim().toLowerCase()
      : `${normalizedPhoneCode}${normalizedMobile}`;

    // ── Find user ─────────────────────────────────────────────────────────────
    let user = null;
    if (isEmailMode) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      }).lean();
    } else {
      user = await User.findOne({
        phone_code: normalizedPhoneCode,
        mobile: normalizedMobile,
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      }).lean();
    }

    const isExistingUser = !!user;
    const is_otp_login = purpose === "auth" && isExistingUser;

    // ── Existing user validation (login flow only) ────────────────────────────
    if (is_otp_login) {
      // 1. Account must be active
      if (user.status !== "active") {
        throw StatusError.forbidden(
          req.__("Your account has been blocked. Please contact support."),
        );
      }

      // 2. Contact must be verified
      if (isEmailMode && !user.email_verified_at) {
        throw StatusError.forbidden(
          req.__("Your email is not verified. Please contact support."),
        );
      }
      if (!isEmailMode && !user.mobile_verified_at) {
        throw StatusError.forbidden(
          req.__("Your mobile number is not verified. Please contact support."),
        );
      }
    }

    // ── Non-auth: user must exist ─────────────────────────────────────────────
    if (purpose !== "auth" && !isExistingUser) {
      throw StatusError.notFound(
        req.__(
          "No account found with this {{type}}. Please check and try again.",
          {
            type: isEmailMode ? "email" : "mobile number",
          },
        ),
      );
    }

    // ── Rate limit cooldown ───────────────────────────────────────────────────
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
            {
              seconds: secondsLeft,
            },
          ),
        );
      }
    }

    // ── Generate OTP ──────────────────────────────────────────────────────────
    const otp = generalHelper.generateOtp(OTP_LENGTH);
    const hashedOtp = await generalHelper.bcryptMake(otp);
    const purposeLabel = getPurposeLabel(purpose, isExistingUser);

    // ── Invalidate previous OTPs ──────────────────────────────────────────────
    await OtpVerification.updateMany(
      { identifier, purpose, verified_at: null },
      { expired_at: moment().toDate() },
    );

    // ── Save new OTP — omit email/mobile instead of null ─────────────────────
    await OtpVerification.create({
      identifier,
      ...(isEmailMode
        ? { email: email.trim().toLowerCase() }
        : { mobile: normalizedMobile }),
      otp: hashedOtp,
      purpose,
      expires_at: moment().add(OTP_EXPIRY_MINUTES, "minutes").toDate(),
      meta: { ip: req.ip, user_agent: req.headers["user-agent"] },
    });

    // ── Deliver OTP ───────────────────────────────────────────────────────────
    if (isEmailMode) {
      const emailResponse = await emailService.sendEmail(
        email,
        "otp",
        "YOUR OTP CODE",
        "en",
        {
          name: user?.name ?? "User",
          otp,
          expiry: OTP_EXPIRY_MINUTES,
          purpose: purposeLabel,
        },
      );

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
      const smsResponse = await smsService.sendSMS({
        to: identifier,
        message: "189215",
        variables: [user?.name ?? "User", purposeLabel, otp],
      });

      if (smsResponse?.success === false) {
        await OtpVerification.deleteMany({
          identifier,
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

    return res.status(200).json({
      status: "success",
      message: req.__("OTP sent successfully"),
      data: {
        is_existing_user: isExistingUser,
        is_otp_login,
        is_email: isEmailMode,
        purpose,
      },
    });
  } catch (error) {
    next(error);
  }
};
