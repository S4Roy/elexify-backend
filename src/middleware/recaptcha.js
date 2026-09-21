import { getRecaptchaConfig } from "../services/recaptcha/config.js";
import { verifyRecaptcha } from "../services/recaptcha/verify.js";
import { isSuspiciousCheckout } from "../services/recaptcha/checkoutRisk.js";
import { recordOperationalEvent } from "../services/observability/recordOperationalEvent.js";

export const requireRecaptcha = action => async (req, res, next) => {
  try {
    const config = await getRecaptchaConfig();
    if (!config || config[`protect_${action}`] !== "true") return next();
    if (action === "checkout" && !(await isSuspiciousCheckout(req, config))) return next();
    const token = req.headers["x-recaptcha-token"];
    // A checkout challenge is issued before any business side effects. The
    // storefront may retry exactly once with a fresh token in enforce mode.
    if (!token && action === "checkout" && config.mode === "enforce") {
      return res.status(403).json({ status: "error", code: "RECAPTCHA_REQUIRED", action, message: "Please complete verification and try again." });
    }
    const result = await verifyRecaptcha(config, action, token);
    if (!result.valid) {
      void recordOperationalEvent({
        eventType: "recaptcha_verification", severity: "warning", correlationId: `${action}:${config.mode}:${result.reason}`,
        summary: "Form abuse verification did not pass",
        metadata: { action, mode: config.mode, reason: result.reason, score: result.score },
      }).catch(() => undefined);
      if (config.mode === "enforce") return res.status(result.reason === "provider_unavailable" ? 503 : 403).json({
        status: "error", code: "RECAPTCHA_FAILED", message: "We could not verify this request. Please try again shortly.",
      });
    }
    return next();
  } catch {
    // Configuration/risk-store failure must not silently disable enforcement.
    return res.status(503).json({ status: "error", code: "RECAPTCHA_UNAVAILABLE", message: "Verification is temporarily unavailable. Please try again." });
  }
};
