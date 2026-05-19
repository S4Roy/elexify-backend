import User from "../../../models/User.js";
import UserResource from "../../../resources/UserResource.js";
import { StatusError } from "../../../config/index.js";
import { generalHelper } from "../../../helpers/index.js";

/**
 * Admin — Edit Customer
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, name, email, phone_code, mobile, password, status } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Customer ID is required"));
    }

    // ── Find existing customer ────────────────────────────────────────────────
    const customer = await User.findOne({
      _id,
      role: { $in: ["user", "customer"] },
      deleted_at: null,
    });

    if (!customer) {
      throw StatusError.notFound(req.__("Customer not found"));
    }

    // ── Check duplicate email (exclude self) ──────────────────────────────────
    if (email && email.trim().toLowerCase() !== customer.email) {
      const emailExists = await User.findOne({
        email: email.trim().toLowerCase(),
        deleted_at: null,
        _id: { $ne: _id },
      });
      if (emailExists) {
        throw StatusError.conflict(
          req.__("A user with this email already exists"),
        );
      }
    }

    // ── Check duplicate mobile (exclude self) ─────────────────────────────────
    if (mobile && mobile.trim() !== customer.mobile) {
      const mobileExists = await User.findOne({
        phone_code: phone_code ?? customer.phone_code ?? "91",
        mobile: mobile.trim(),
        deleted_at: null,
        _id: { $ne: _id },
      });
      if (mobileExists) {
        throw StatusError.conflict(
          req.__("A user with this mobile number already exists"),
        );
      }
    }

    // ── Build update payload ──────────────────────────────────────────────────
    const updateData = {
      ...(name && { name: name.trim() }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // Email changed — update and mark verified (admin action)
    if (email && email.trim().toLowerCase() !== customer.email) {
      updateData.email = email.trim().toLowerCase();
      updateData.email_verified_at = new Date();
    }

    // Mobile changed — update and mark verified (admin action)
    if (mobile && mobile.trim() !== customer.mobile) {
      updateData.mobile = mobile.trim();
      updateData.phone_code = phone_code ?? customer.phone_code ?? "91";
      updateData.mobile_verified_at = new Date();
    }

    // Password — hash only if provided
    if (password) {
      updateData.password = await generalHelper.bcryptMake(password);
    }

    // ── Apply update ──────────────────────────────────────────────────────────
    const updatedCustomer = await User.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true },
    );

    return res.status(200).json({
      status: "success",
      message: req.__("Customer updated successfully"),
      data: new UserResource(updatedCustomer).exec(),
    });
  } catch (error) {
    next(error);
  }
};
