import { revokeAll } from '../../services/customerSession/index.js';
import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, userRoleService, notificationService } from "../../services/index.js";
import { generalHelper } from "../../helpers/index.js";

/**
 * Reset password via emailed token (forgot-password flow)
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
    const changed = await User.findOneAndUpdate({ _id: userId, reset_token: token, deleted_at: null, status: "active" }, {
      password: hashedPassword,
      // One-time use — this also stops the emailed link being replayed
      // within its 1h window after it's already been used once.
      reset_token: null,
      // Invalidates every token issued before now — see resolveAuthorization().
      password_changed_at: new Date(),
      // A reset the owner completes is proof of ownership — clear any
      // lockout from earlier failed login attempts too.
      failed_login_attempts: 0,
      login_locked_until: null,
    });

    if (!changed) throw StatusError.unauthorized("Invalid or expired token");
    await revokeAll(userId, req, "PASSWORD_CHANGED");

    // Mandatory security event, same as the self-service change-password path.
    notificationService
      .sendNotification({ userId, event: "PASSWORD_CHANGED", data: {} })
      .catch(() => {});

    res.status(200).json({
      status: true,
      message: req.__("Password reset successfully"),
    });
  } catch (error) {
    next(error);
  }
};
