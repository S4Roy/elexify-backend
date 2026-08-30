import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError, envs } from "../../config/index.js";
import { userService, inventoryService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";
import { normalizeMobile } from "../../helpers/mobileHelper.js";

export const verifyUserOtp = async (req, res, next) => {
  try {
    const {
      email,
      mobile,
      phone_code = "91",
      otp,
      purpose = "auth",
      first_name,
      last_name,
    } = req.body;

    const guest_id = req.auth?.guest_id || null;
    const isEmailMode = !!email;

    // ── Normalize + validate mobile — identical logic to sendOtpToUser ───────
    let normalizedMobile = null;
    if (!isEmailMode) {
      normalizedMobile = normalizeMobile(mobile, phone_code);
      if (!normalizedMobile) {
        throw StatusError.badRequest(req.__("Invalid mobile number"));
      }
    }

    // ── identifier — same logic as sendOtpToUser ──────────────────────────────
    const identifier = isEmailMode
      ? email.trim().toLowerCase()
      : `${phone_code}${normalizedMobile}`;

    // ── Fetch OTP record by identifier ────────────────────────────────────────
    const otpRecord = await OtpVerification.findOne({
      identifier,
      purpose,
      verified_at: null,
      expired_at: null,
      attempts: { $lt: envs.otp.max_attempts },
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      throw StatusError.badRequest(req.__("OTP not found or already used"));
    }

    if (moment().isAfter(moment(otpRecord.expires_at))) {
      await otpRecord.updateOne({ expired_at: new Date() });
      throw StatusError.badRequest(req.__("OTP has expired"));
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
        { new: true },
      );
      if (!failed || failed.attempts >= envs.otp.max_attempts) {
        await OtpVerification.updateOne(
          { _id: otpRecord._id, verified_at: null },
          { $set: { expired_at: new Date() } },
        );
        throw StatusError.tooManyRequests(req.__("OTP attempt limit exceeded. Request a new code."));
      }
      throw StatusError.badRequest(req.__("Invalid OTP"));
    }

    const consumed = await OtpVerification.findOneAndUpdate(
      { _id: otpRecord._id, verified_at: null, expired_at: null },
      { $set: { verified_at: new Date() } },
      { new: true },
    );
    if (!consumed) throw StatusError.badRequest(req.__("OTP already used or expired"));

    // ── Find or create user ───────────────────────────────────────────────────
    let user = null;
    let isNewUser = false;

    if (isEmailMode) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      });
    } else {
      user = await User.findOne({
        phone_code,
        mobile: normalizedMobile,
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      });
    }

    if (!user) {
      // ── New user — create account ─────────────────────────────────────────
      isNewUser = true;
      const name =
        [first_name?.trim(), last_name?.trim()].filter(Boolean).join(" ") ||
        "User";

      user = await User.create({
        role: "customer",
        name,
        ...(isEmailMode
          ? { email: email.trim().toLowerCase(), email_verified_at: new Date() }
          : {
              mobile: normalizedMobile,
              phone_code,
              mobile_verified_at: new Date(),
            }),
        status: "active",
      });
    } else {
      // ── Existing user — validate status and verified_at ───────────────────
      if (user.status !== "active") {
        throw StatusError.forbidden(
          req.__("Your account has been blocked. Please contact support."),
        );
      }

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

    // ── Guest → User cart / wishlist transfer ─────────────────────────────────
    if (guest_id) {
      await inventoryService.cartService.transferGuestCartToUser(
        guest_id,
        user._id,
      );
      await inventoryService.cartService.transferGuestTempCartToUser(
        guest_id,
        user._id,
      );
      await inventoryService.wishlistService.transferGuestWishlistToUser(
        guest_id,
        user._id,
      );
    }

    // ── Build response data based on purpose ──────────────────────────────────
    let data = {};

    if (purpose === "auth") {
      const token = await userService.generateTokens({
        user_id: user._id,
        email: user.email,
        role: user.role,
      });
      data = {
        is_new_user: isNewUser,
        user: new UserResource(user).exec(),
        token,
      };
    } else if (purpose === "forgot_password" || purpose === "reset_password") {
      const resetToken = await userService.generateResetToken(user._id);
      data = { reset_token: resetToken };
    }

    return res.status(200).json({
      status: "success",
      message: req.__("OTP verified successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
