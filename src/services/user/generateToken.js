import jwt from "jsonwebtoken";
import { envs } from "../../config/index.js";

/**
 * Generate access token
 * @param details
 */
export const generateTokens = async (data) => {
  const accessToken = jwt.sign(data, envs.jwt.accessToken.secret, {
    expiresIn: envs.jwt.accessToken.expiry,
  });

  return {
    access_token: accessToken,
    access_token_expiry: envs.jwt.accessToken.expiry,
  };
};
