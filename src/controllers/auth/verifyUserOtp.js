import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, inventoryService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

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
    const identifier = isEmailMode
      ? email.trim().toLowerCase()
      : `${phone_code}${mobile.trim()}`;

    // ── Fetch & validate OTP record ───────────────────────────────────────────
    const otpRecord = await OtpVerification.findOne({
      email: isEmailMode ? email.trim().toLowerCase() : null,
      mobile: isEmailMode ? null : `${phone_code}${mobile.trim()}`,
      purpose,
      verified_at: null,
      expired_at: null,
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
      throw StatusError.badRequest(req.__("Invalid OTP"));
    }

    // ── Mark OTP as verified ──────────────────────────────────────────────────
    await otpRecord.updateOne({ verified_at: new Date() });

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
        mobile: mobile.trim(),
        deleted_at: null,
        role: { $in: ["user", "customer"] },
      });
    }

    if (!user) {
      // New user — create account
      isNewUser = true;
      const name =
        [first_name?.trim(), last_name?.trim()].filter(Boolean).join(" ") ||
        "User";

      user = await User.create({
        role: "customer",
        name,
        ...(isEmailMode
          ? { email: email.trim().toLowerCase() }
          : { mobile: mobile.trim(), phone_code }),
        status: "active",
        email_verified_at: isEmailMode ? new Date() : null,
        mobile_verified_at: !isEmailMode ? new Date() : null,
      });
    } else {
      // Existing user checks
      if (user.status !== "active") {
        throw StatusError.forbidden(req.__("This account has been blocked"));
      }

      // Mark verified
      if (isEmailMode && !user.email_verified_at) {
        await user.updateOne({ email_verified_at: new Date() });
      }
      if (!isEmailMode && !user.mobile_verified_at) {
        await user.updateOne({ mobile_verified_at: new Date() });
      }
    }

    // ── Guest → User cart / wishlist transfer ─────────────────────────────────
    if (guest_id) {
      await inventoryService.cartService.transferGuestCartToUser(
        guest_id,
        user._id,
      );
      await inventoryService.wishlistService.transferGuestWishlistToUser(
        guest_id,
        user._id,
      );
    }

    // ── Generate tokens ───────────────────────────────────────────────────────
    const token = await userService.generateTokens({
      user_id: user._id,
      email: user.email,
      role: user.role,
    });

    // ── Response ──────────────────────────────────────────────────────────────
    return res.status(200).json({
      status: "success",
      message: req.__("OTP verified successfully"),
      data: {
        is_new_user: isNewUser,
        user: new UserResource(user).exec(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};
