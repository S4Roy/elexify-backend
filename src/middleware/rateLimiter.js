import rateLimit from "express-rate-limit";

/**
 * Limits brute-force attempts against login, OTP, and password-reset endpoints.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Browser E2E repeatedly authenticates freshly reseeded users from one
  // loopback IP. Keep production brute-force protection unchanged while
  // preventing the isolated NODE_ENV=test harness from rate-limiting itself.
  limit: process.env.NODE_ENV === "test" ? 1_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

/**
 * Limits requests to the logged-in email/mobile change + OTP-resend
 * endpoints (per IP). /api/v1/user/* has no rate limiting otherwise.
 */
export const accountChangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 1_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});
