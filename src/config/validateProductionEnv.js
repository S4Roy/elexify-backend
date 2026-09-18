// Validate the resolved managed credentials (with optional environment
// fallback) when Razorpay is used. Startup must remain available so an admin
// can configure the provider on a fresh production installation.
export const validateProductionRazorpayConfig = (credentials, environment = process.env) => {
  if (environment.NODE_ENV !== "production") return credentials;
  const required = ["key_id", "key_secret", "webhook_secret", "account_id"];
  const missing = required.filter((field) => !String(credentials?.[field] || "").trim());
  if (missing.length) {
    throw new Error(`Production Razorpay configuration is incomplete: missing ${missing.join(", ")}`);
  }
  if (!String(credentials.key_id).startsWith("rzp_live_")) {
    throw new Error("Production requires a Razorpay live-mode key (rzp_live_*)");
  }
  return credentials;
};
