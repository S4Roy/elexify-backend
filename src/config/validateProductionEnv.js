const REQUIRED_PRODUCTION_PAYMENT_ENV = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_ACCOUNT_ID",
];

export const validateProductionEnv = (environment = process.env) => {
  if (environment.NODE_ENV !== "production") return [];
  const missing = REQUIRED_PRODUCTION_PAYMENT_ENV.filter(
    (name) => !String(environment[name] || "").trim(),
  );
  if (missing.length) {
    throw new Error(`Production payment configuration is incomplete: missing ${missing.join(", ")}`);
  }
  if (!String(environment.RAZORPAY_KEY_ID).startsWith("rzp_live_")) {
    throw new Error("Production requires a Razorpay live-mode key (rzp_live_*)");
  }
  return REQUIRED_PRODUCTION_PAYMENT_ENV;
};

