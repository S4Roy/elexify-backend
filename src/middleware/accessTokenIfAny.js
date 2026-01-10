import { userService } from "../services/index.js";

/**
 * Middleware to optionally validate the Authorization header and decode user token
 * If no token is provided, it allows guest access via `x-guest-id`.
 */
export const accessTokenIfAny = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
    const guest_id = req.headers["x-guest-id"] || null;

    if (token) {
      const decodedData = await userService.verifyToken(token);
      if (decodedData && decodedData.user_id) {
        req.auth = {
          user_id: decodedData.user_id,
          email: decodedData.email,
          role: decodedData.role,
          guest_id: guest_id,
        };
      }
    } else if (guest_id) {
      req.auth = { guest_id };
    }

    next();
  } catch (error) {
    // Log and continue as guest (optional) or block request
    console.error("Token verification failed:", error.message);
    next(); // Allow guest access even if token is invalid
  }
};
