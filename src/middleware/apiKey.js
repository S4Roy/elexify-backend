import { validReturnWebhookToken } from "../services/returnService/webhookAuth.js";
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

    const carrierWebhook = req.method === 'POST' && req.originalUrl?.split('?')[0].endsWith('/site/webhook/order/update-status');
    if (apiKey !== process.env.API_KEY && !(carrierWebhook && validReturnWebhookToken(apiKey))) {
      return next(StatusError.forbidden("Invalid API key"));
    }

    req.accept_language = req.headers["accept-language"] || "en";

    next();
  } catch (error) {
    next(error);
  }
};
