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
    const decodeData = jwt.verify(token, envs.jwt.accessToken.secret, { algorithms: ["HS256"] });
    return decodeData;
  } catch (error) {
    const failure = StatusError.forbidden("Invalid access token");
    failure.cause = error;
    throw failure;
  }
};
