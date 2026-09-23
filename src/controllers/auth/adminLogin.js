import Role from "../../models/Role.js";
import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError, envs } from "../../config/index.js";
import { userService, userRoleService, notificationService } from "../../services/index.js";
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

    // Locked out from an earlier run of failed attempts — reject before
    // even checking the password, so a locked-out attacker (or the real
    // owner) can't burn more attempts or extend the window.
    if (user.login_locked_until && user.login_locked_until > new Date()) {
      const minutesLeft = Math.ceil(
        (user.login_locked_until.getTime() - Date.now()) / 60000
      );
      throw StatusError.locked(
        req.__(
          `Too many failed login attempts. Try again in ${minutesLeft} minute(s).`
        )
      );
    }

    // Validate Password
    const isPasswordValid = await generalHelper.bcryptCheck(
      password,
      user.password
    );
    if (!isPasswordValid) {
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;

      if (user.failed_login_attempts >= envs.adminLoginSecurity.max_attempts) {
        const lockoutMinutes = envs.adminLoginSecurity.lockout_minutes;
        user.login_locked_until = new Date(Date.now() + lockoutMinutes * 60000);
        user.failed_login_attempts = 0;
        await user.save();

        // Mandatory security event — fires regardless of notification
        // preferences. Never throws (see sendNotification), so it can't
        // turn a successful lockout into a 500.
        notificationService
          .sendNotification({
            userId: user._id,
            event: "ACCOUNT_LOCKED",
            data: { lockout_minutes: lockoutMinutes },
          })
          .catch(() => {});

        throw StatusError.locked(
          req.__(
            `Too many failed login attempts. Your account has been locked for ${lockoutMinutes} minutes.`
          )
        );
      }

      await user.save();
      throw StatusError.unauthorized(
        req.__("The password you entered is incorrect")
      );
    }

    // Successful login — clear any accumulated failed-attempt state.
    if (user.failed_login_attempts > 0 || user.login_locked_until) {
      user.failed_login_attempts = 0;
      user.login_locked_until = null;
      await user.save();
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
