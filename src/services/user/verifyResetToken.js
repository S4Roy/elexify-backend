import jwt from "jsonwebtoken";
import { envs } from "../../config/index.js";
import User from "../../models/User.js";

/**
 * Generate access token
 * @param details
 */
export const verifyResetToken = async (token) => {
  try {
    const decoded = jwt.verify(token, envs.jwt.accessToken.secret);
    const user = await User.findOne({
      _id: decoded.userId,
      reset_token: token,
    });
    return user ? user._id : null;
  } catch (err) {
    return null;
  }
};
