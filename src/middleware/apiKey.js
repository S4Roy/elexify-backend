/**
 * Middleware to validate X-API-KEY header.
 */
import { StatusError } from "../config/index.js";

export const validateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return next(StatusError.forbidden("Missing X-API-KEY header"));
    }

    if (apiKey !== process.env.API_KEY) {
      return next(StatusError.forbidden("Invalid API key"));
    }

    req.accept_language = req.headers["accept-language"] || "en";

    next();
  } catch (error) {
    next(error);
  }
};
