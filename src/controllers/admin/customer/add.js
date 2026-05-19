import User from "../../../models/User.js";
import UserResource from "../../../resources/UserResource.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Admin — Add Customer
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone_code,
      mobile,
      password,
      status = "active",
    } = req.body;

    // ── Must provide at least email or mobile ─────────────────────────────────
    if (!email && !mobile) {
      throw StatusError.badRequest(
        req.__("Email or mobile number is required"),
      );
    }

    // ── Check duplicate email ─────────────────────────────────────────────────
    if (email) {
      const emailExists = await User.findOne({
        email: email.trim().toLowerCase(),
        deleted_at: null,
      });
      if (emailExists) {
        throw StatusError.conflict(
          req.__("A user with this email already exists"),
        );
      }
    }

    // ── Check duplicate mobile ────────────────────────────────────────────────
    if (mobile) {
      const mobileExists = await User.findOne({
        phone_code: phone_code ?? "91",
        mobile: mobile.trim(),
        deleted_at: null,
      });
      if (mobileExists) {
        throw StatusError.conflict(
          req.__("A user with this mobile number already exists"),
        );
      }
    }

    // ── Hash password if provided ─────────────────────────────────────────────
    const hashedPassword = password
      ? await generalHelper.bcryptMake(password)
      : null;

    // ── Create customer ───────────────────────────────────────────────────────
    const user = await User.create({
      role: "customer",
      name: name.trim(),
      status,
      ...(email && {
        email: email.trim().toLowerCase(),
        email_verified_at: new Date(), // admin-created = pre-verified
      }),
      ...(mobile && {
        mobile: mobile.trim(),
        phone_code: phone_code ?? "91",
        mobile_verified_at: new Date(), // admin-created = pre-verified
      }),
      ...(hashedPassword && { password: hashedPassword }),
      created_by: req.auth.user_id,
    });

    return res.status(201).json({
      status: "success",
      message: req.__("Customer created successfully"),
      data: new UserResource(user).exec(),
    });
  } catch (error) {
    next(error);
  }
};
