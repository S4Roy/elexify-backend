import { OAuth2Client } from "google-auth-library";
import User from "../../models/User.js";
import UserResource from "../../resources/UserResource.js";
import { StatusError, envs } from "../../config/index.js";
import { userService, inventoryService } from "../../services/index.js";
import { getIntegrationConfig } from "../../services/integrationCredentials/index.js";

export const googleLogin = async (req, res, next) => {
  try {
    const { id_token } = req.body;
    const guest_id = req.auth?.guest_id || null;
    const google = await getIntegrationConfig("google", { client_id: envs.google.clientId });
    if (!google?.client_id) throw StatusError.serviceUnavailable("Google Sign-In is not configured");
    const client = new OAuth2Client(google.client_id);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: google.client_id,
      });
      payload = ticket.getPayload();
    } catch {
      throw StatusError.unauthorized(req.__("Invalid Google credential"));
    }

    if (!payload?.email) {
      throw StatusError.badRequest(
        req.__("Google account has no email address"),
      );
    }

    const email = payload.email.trim().toLowerCase();

    let user = await User.findOne({
      email,
      deleted_at: null,
      role: { $in: ["user", "customer"] },
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        role: "customer",
        name: payload.name || "User",
        email,
        email_verified_at: new Date(),
        google_id: payload.sub,
        profile_image: payload.picture || null,
        status: "active",
      });
    } else {
      if (user.status !== "active") {
        throw StatusError.forbidden(
          req.__("Your account has been blocked. Please contact support."),
        );
      }

      const updates = {};
      if (!user.google_id) updates.google_id = payload.sub;
      if (!user.email_verified_at) updates.email_verified_at = new Date();
      if (Object.keys(updates).length) {
        await user.updateOne(updates);
        Object.assign(user, updates);
      }
    }

    if (guest_id) {
      await inventoryService.cartService.transferGuestCartToUser(
        guest_id,
        user._id,
      );
      await inventoryService.cartService.transferGuestTempCartToUser(
        guest_id,
        user._id,
      );
      await inventoryService.wishlistService.transferGuestWishlistToUser(
        guest_id,
        user._id,
      );
    }

    const token = await userService.generateTokens({
      user_id: user._id,
      email: user.email,
      role: user.role,
    });

    return res.status(200).json({
      status: "success",
      message: req.__("Logged in successfully"),
      data: {
        is_new_user: isNewUser,
        user: new UserResource(user).exec(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};
