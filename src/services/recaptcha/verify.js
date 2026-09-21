export const verifyRecaptcha = async (config, action, token, { fetchImpl = fetch, now = Date.now() } = {}) => {
  if (typeof token !== "string" || !token || token.length > 4096) return { valid: false, reason: "missing_token" };
  try {
    const response = await fetchImpl("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: config.secret_key, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { valid: false, reason: "provider_unavailable" };
    const result = await response.json();
    if (result.success !== true) return { valid: false, reason: "invalid_token" };
    if (result.action !== action) return { valid: false, reason: "action_mismatch" };
    if (!config.hosts.includes(String(result.hostname || "").toLowerCase())) return { valid: false, reason: "hostname_mismatch" };
    const age = now - Date.parse(result.challenge_ts);
    if (!Number.isFinite(age) || age < -10_000 || age > 120_000) return { valid: false, reason: "expired_token" };
    if (typeof result.score !== "number" || !Number.isFinite(result.score) || result.score < 0 || result.score > 1) return { valid: false, reason: "invalid_score" };
    return { valid: result.score >= config.threshold, reason: result.score >= config.threshold ? "accepted" : "low_score", score: result.score };
  } catch {
    return { valid: false, reason: "provider_unavailable" };
  }
};
