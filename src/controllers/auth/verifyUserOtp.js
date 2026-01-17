import moment from "moment";
import User from "../../models/User.js";
import OtpVerification from "../../models/OtpVerification.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, inventoryService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * Verify User OTP & Login
 */
export const verifyUserOtp = async (req, res, next) => {
  try {
    const { phone_code, phone_number, otp } = req.body;
    const guest_id = req.auth?.guest_id || null;

    if (!phone_code || !phone_number || !otp) {
      throw StatusError.badRequest(req.__("Phone number and OTP are required"));
    }

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
    });

    if (!user) {
      throw StatusError.notFound(
        req.__("User with this phone number not found")
      );
    }

    if (user.status !== "active") {
      throw StatusError.forbidden(req.__("The account has been blocked"));
    }

    /* =========================
       Fetch Latest OTP
    ========================== */
    const otpRecord = await OtpVerification.findOne({
      mobile,
      purpose: "login",
      verified_at: null,
      expired_at: null,
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      throw StatusError.badRequest(req.__("OTP not found or already used"));
    }

    /* =========================
       Expiry Check
    ========================== */
    if (moment().isAfter(moment(otpRecord.expires_at))) {
      await otpRecord.updateOne({ expired_at: new Date() });
      throw StatusError.badRequest(req.__("OTP has expired"));
    }

    /* =========================
       Verify OTP (bcrypt)
    ========================== */
    const isOtpValid = await generalHelper.bcryptCheck(otp, otpRecord.otp);

    if (!isOtpValid) {
      throw StatusError.badRequest(req.__("Invalid OTP"));
    }

    /* =========================
       Mark OTP as Verified
    ========================== */
    await otpRecord.updateOne({
      verified_at: new Date(),
    });

    /* =========================
       Guest → User Data Transfer
    ========================== */
    if (guest_id) {
      await inventoryService.cartService.transferGuestCartToUser(
        guest_id,
        user._id
      );
      await inventoryService.wishlistService.transferGuestWishlistToUser(
        guest_id,
        user._id
      );
    }

    /* =========================
       Generate JWT Token
    ========================== */
    const token = await userService.generateTokens({
      user_id: user._id,
      email: user.email,
      role: user.role,
    });

    /* =========================
       Success Response
    ========================== */
    return res.status(200).json({
      status: "success",
      message: req.__("OTP verified successfully"),
      data: {
        user: new UserResource(user).exec(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};
