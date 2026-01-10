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
export const resetPassword = async (req, res, next) => {
  try {
    const { token, new_password } = req.body;

    const userId = await userService.verifyResetToken(token);

    if (!userId)
      throw StatusError.unauthorized(req.__("Invalid or expired token"));

    // Hash New Password
    const hashedPassword = await generalHelper.bcryptMake(new_password);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    res.status(200).json({
      status: "success",
      message: req.__("Password reset successfully"),
    });
  } catch (error) {
    next(error);
  }
};
