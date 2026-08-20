// Builds the cors() options object from a list of known first-party
// frontend URLs. Split out from server.js so the origin-check logic can be
// unit tested without booting the whole app (DB connection, cron jobs,
// app.listen, etc).
export const buildAllowedOrigins = (...urls) =>
  urls.filter(Boolean).map((url) => url.replace(/\/$/, ""));

export const buildCorsOptions = (allowedOrigins) => ({
  origin(origin, callback) {
    // No Origin header — server-to-server calls, curl, mobile apps,
    // Postman — there's no browser origin to check, so allow it through.
    if (!origin) return callback(null, true);

    const isLocalhost = /^http:\/\/localhost(:\d+)?$/.test(origin);
    if (isLocalhost || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Without statusCode, handleError's err.statusCode || 500 fallback
    // reports a disallowed origin as a 500 — misleading in logs/monitoring
    // for what's actually an expected 403.
    const error = new Error(`Not allowed by CORS: ${origin}`);
    error.statusCode = 403;
    callback(error);
  },
  credentials: true,
});
