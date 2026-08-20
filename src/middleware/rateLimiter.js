import rateLimit from "express-rate-limit";

/**
 * Limits brute-force attempts against login, OTP, and password-reset endpoints.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});
