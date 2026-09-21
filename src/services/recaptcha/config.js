import { getIntegrationConfig } from "../integrationCredentials/index.js";

export const RECAPTCHA_ACTIONS = ["login", "registration", "forgot_password", "contact", "review", "newsletter", "checkout"];
export const RECAPTCHA_DEFAULTS = {
  mode: "monitor", score_threshold: "0.5", checkout_attempts: "5",
  ...Object.fromEntries(RECAPTCHA_ACTIONS.map(action => [`protect_${action}`, "true"])),
};
export const validateRecaptchaConfig = config => {
  if (!config?.site_key || !config?.secret_key) throw new Error("reCAPTCHA site key and secret key are required.");
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(config.site_key)) throw new Error("Invalid reCAPTCHA site key format.");
  if (!["monitor", "enforce"].includes(config.mode)) throw new Error("reCAPTCHA mode must be monitor or enforce.");
  const threshold = Number(config.score_threshold);
  if (!String(config.score_threshold).trim() || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("Score threshold must be between 0 and 1.");
  const attempts = Number(config.checkout_attempts);
  if (!Number.isInteger(attempts) || attempts < 2 || attempts > 100) throw new Error("Checkout attempt threshold must be an integer between 2 and 100.");
  for (const action of RECAPTCHA_ACTIONS) {
    if (!["true", "false"].includes(config[`protect_${action}`])) throw new Error(`Invalid protection setting for ${action}.`);
  }
  const hosts = String(config.allowed_hostnames || "").split(",").map(host => host.trim().toLowerCase());
  if (!hosts.length || hosts.some(host => !/^(?:localhost|(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(host) || host.includes(".."))) {
    throw new Error("Enter comma-separated hostnames without protocols, ports, paths, or wildcards.");
  }
  return { ...config, hosts, threshold, checkoutAttempts: attempts };
};
export const getRecaptchaConfig = async () => {
  // No environment fallback: saving and enabling this provider is deliberate.
  const config = await getIntegrationConfig("recaptcha", null);
  return config ? validateRecaptchaConfig({ ...RECAPTCHA_DEFAULTS, ...config }) : null;
};
export const publicRecaptchaConfig = async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const config = await getRecaptchaConfig();
    return res.json({ status: "success", data: config ? {
      enabled: true, mode: config.mode, site_key: config.site_key,
      actions: RECAPTCHA_ACTIONS.filter(action => config[`protect_${action}`] === "true"),
    } : { enabled: false, actions: [] } });
  } catch {
    return res.status(503).json({ status: "error", message: "Verification configuration is unavailable. Please try again." });
  }
};
