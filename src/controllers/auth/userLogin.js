import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError } from "../../config/index.js";
import { userService, inventoryService } from "../../services/index.js";
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
      throw StatusError.unauthorized(
        req.__("The email you entered is invalid")
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
      throw StatusError.unauthorized(
        req.__("The password you entered is incorrect")
      );
    }
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
