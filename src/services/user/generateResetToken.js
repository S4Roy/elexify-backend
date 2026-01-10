import jwt from "jsonwebtoken";
import { envs } from "../../config/index.js";
import User from "../../models/User.js";

/**
 * Generate access token
 * @param details
 */
export const generateResetToken = async (userId) => {
  const token = jwt.sign({ userId }, envs.jwt.accessToken.secret, {
    expiresIn: "1h",
  });

  await User.findByIdAndUpdate(userId, { reset_token: token });
  return token;
};
