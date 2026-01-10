import { userService, userRoleService } from "../services/index.js";
import { StatusError } from "../config/index.js";

/**
 * This function is used for validating authorization header
 * @param req
 * @param res
 * @param next
 */
export const validateAccessToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const guest_id = req.headers["x-guest-id"] || null;

    if (!token) throw StatusError.forbidden("Please login to continue.");
    const decodedData = await userService.verifyToken(token);
    if (!decodedData) throw StatusError.unauthorized("Invalid access token.");

    const userDetails = decodedData;
    if (!userDetails) throw StatusError.unauthorized("User  not found.");

    // const userRole = await userRoleService.getUserRole(userDetails.id);
    // if (!userRole) throw StatusError.unauthorized("User  role not found.");

    req["auth"] = {
      guest_id: guest_id,
      user_id: userDetails.user_id,
      email: userDetails.email,
      role: userDetails.role,
    };
    next();
  } catch (error) {
    next(error);
  }
};
