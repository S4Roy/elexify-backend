// Classifies a delivery failure so processNotificationQueue.js knows
// whether to retry (TRANSIENT/PROVIDER_REJECTED) or dead-letter immediately
// (PERMANENT/INVALID_DESTINATION/UNVERIFIED_DESTINATION/TEMPLATE_ERROR —
// retrying these can't succeed without a human fixing something first).
//
// The underlying providers (services/email/sendMail.js, services/sms/
// fast2sms.service.js) currently return coarse boolean/success flags with
// only a short error code/string — this is a best-effort heuristic given
// that signal, not a guarantee. A finer-grained provider error contract
// would be a reasonable future improvement.

const KNOWN = {
  no_email_on_file: "INVALID_DESTINATION",
  no_mobile_on_file: "INVALID_DESTINATION",
  whatsapp_provider_not_configured: "PERMANENT",
  template_or_delivery_failed: "TEMPLATE_ERROR",
};

export const classifyNotificationError = (channel, errorCode) => {
  const code = String(errorCode || "").toLowerCase();

  if (KNOWN[errorCode]) return KNOWN[errorCode];

  if (code.includes("invalid") || code.includes("not found") || code.includes("no such")) {
    return "PROVIDER_REJECTED";
  }
  if (code.includes("timeout") || code.includes("econn") || code.includes("network") || code.includes("exception")) {
    return "TRANSIENT";
  }

  // Default to TRANSIENT — worth a bounded retry rather than giving up
  // immediately on an unrecognized error shape.
  return "TRANSIENT";
};
