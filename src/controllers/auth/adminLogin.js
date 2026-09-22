import Role from "../../models/Role.js";
import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, userRoleService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * Admin Login
 * @param req
 * @param res
 * @param next
 */
export const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw StatusError.badRequest(req.__("Email and password are required"));
    }

    const user = await User.findOne({
      email,
      admin_role_id: { $ne: null },
      deleted_at: null,
    }).exec();

    if (!user) {
      throw StatusError.notFound(req.__("The email you entered is invalid"));
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
      throw StatusError.unauthorized(
        req.__("The password you entered is incorrect")
      );
    }
    const adminRole = await Role.findOne({ _id: user.admin_role_id, status: "active", deleted_at: null }).lean();
    if (!adminRole) throw StatusError.forbidden("Admin access is unavailable.");

    // Generate JWT Token
    const token = await userService.generateTokens({
      user_id: user._id,
      email: user.email,
      role: user.role,
    });

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
