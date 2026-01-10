import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, emailService } from "../../services/index.js";
import { envs } from "../../config/index.js";

/**
 * Admin Login
 * @param req
 * @param res
 * @param next
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw StatusError.badRequest(req.__("Email is required"));

    const user = await User.findOne({ email, deleted_at: null }).exec();
    if (!user) throw StatusError.notFound(req.__("User not found"));

    // Generate Reset Token (Valid for 1 hour)
    const resetToken = await userService.generateResetToken(user._id);
    const resetLink = `${envs.adminSiteUrl}/auth/reset-password/${resetToken}`;
    // Send Email
    await emailService.sendEmail(
      user.email,
      "password_reset",
      "RESET PASSWORD",
      "en",
      {
        name: user?.name,
        reset_link: resetLink,
      }
    );

    res.status(200).json({
      status: "success",
      message: req.__("Password reset link sent to your email"),
    });
  } catch (error) {
    next(error);
  }
};
