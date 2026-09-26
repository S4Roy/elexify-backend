import { validateSession, validateLegacyToken } from '../services/customerSession/index.js';
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

    if (!token) return res.status(401).json({ status: "error", success: false, code: "AUTHENTICATION_REQUIRED", message: "Please login to continue." });
    let decodedData;
    try { decodedData = await userService.verifyToken(token); }
    catch (error) { return res.status(401).json({ status: "error", success: false, code: error?.cause?.name === "TokenExpiredError" ? "ACCESS_TOKEN_EXPIRED" : "INVALID_ACCESS_TOKEN", message: "Access token invalid or expired" }); }
    if (!decodedData) throw StatusError.unauthorized("Invalid access token.");

    if (!decodedData.sid && !decodedData.type) await validateLegacyToken(decodedData, token);
    const userDetails = decodedData.sid || decodedData.type ? await validateSession(decodedData, req) : decodedData;
    if (!userDetails) throw StatusError.unauthorized("User  not found.");
    // Tokens are long-lived, so a deleted or blocked account must be
    // rejected here rather than left working until the token expires.
    if (!userDetails.sid && await userService.isAccountClosed(userDetails.user_id, userDetails.iat)) {
      throw StatusError.unauthorized("Session expired. Please login again.");
    }

    // const userRole = await userRoleService.getUserRole(userDetails.id);
    // if (!userRole) throw StatusError.unauthorized("User  role not found.");

    req["auth"] = {
      guest_id: guest_id,
      sid: userDetails.sid,
      user_id: userDetails.user_id,
      email: userDetails.email,
      role: userDetails.role,
      // jwt.sign() stamps this automatically (seconds since epoch); used to
      // reject tokens issued before a password change — see resolveAuthorization().
      iat: userDetails.iat,
    };
    next();
  } catch (error) {
    if (error.statusCode === 401) return res.status(401).json({ status: "error", success: false, code: error.code || "AUTHENTICATION_REQUIRED", message: error.message });
    next(error);
  }
};
