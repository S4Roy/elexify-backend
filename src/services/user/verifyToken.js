import jwt from "jsonwebtoken";
import { StatusError } from "../../config/index.js";
import { envs } from "../../config/index.js";

/**
 * Berify jwt token
 * @param token
 * @param tokenSecret
 */
export const verifyToken = (token) => {
  try {
    const decodeData = jwt.verify(token, envs.jwt.accessToken.secret);
    return decodeData;
  } catch (error) {
    throw StatusError.forbidden(error);
  }
};
