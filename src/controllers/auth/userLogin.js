import { createSession, audit } from '../../services/customerSession/index.js';
import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, inventoryService, auditService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * Admin Login
 * @param req
 * @param res
 * @param next
 */
export const userLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const guest_id = req.auth?.guest_id || null;

    if (!email || !password) {
      throw StatusError.badRequest(req.__("Email and password are required"));
    }

    const user = await User.findOne({
      email,
      role: {
        $in: ["customer"],
      },
      deleted_at: null,
    }).exec();

    if (!user) {
      await audit("LOGIN_FAILED", null, null, req);
      // No matching account — still record the attempt (user_id: null,
      // the attempted email in metadata), same as the admin login path, so
      // credential-stuffing/enumeration against unknown customer emails
      // shows up in the audit trail.
      await auditService.recordAudit({ userId: null, event: "CUSTOMER_LOGIN_FAILED", req,
        metadata: { reason: "unknown_email", attempted_email: email } });
      throw StatusError.unauthorized(
        req.__("Invalid email or password")
      );
    }

    if (user.status !== "active") {
      throw StatusError.forbidden(req.__("The account has been blocked"));
    }

    // Validate Password
    const isPasswordValid = await generalHelper.bcryptCheck(
      password,
      user.password
    );
    if (!isPasswordValid) {
      await audit("LOGIN_FAILED", user._id, null, req);
      await auditService.recordAudit({ userId: user._id, event: "CUSTOMER_LOGIN_FAILED", req,
        metadata: { reason: "wrong_password" } });
      throw StatusError.unauthorized(
        req.__("Invalid email or password")
      );
    }
    if (guest_id) {
      await inventoryService.cartService.transferGuestCartToUser(
        guest_id,
        user._id
      );
      await inventoryService.cartService.transferGuestTempCartToUser(
        guest_id,
        user._id
      );
      await inventoryService.wishlistService.transferGuestWishlistToUser(
        guest_id,
        user._id
      );
    }
    // Generate JWT Token
    const token = await createSession(user, req, res);

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Logged in successfully"),
      data: {
        user: new UserResource(user).exec(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};
