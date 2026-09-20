import { getAccessToken } from "./ZohoAuthService.js";
import { reserveRequestSlot } from "./ZohoRateLimiter.js";

export const REGIONS = Object.freeze({
  in: ["https://accounts.zoho.in", "https://www.zohoapis.in"],
  com: ["https://accounts.zoho.com", "https://www.zohoapis.com"],
  eu: ["https://accounts.zoho.eu", "https://www.zohoapis.eu"],
  au: ["https://accounts.zoho.com.au", "https://www.zohoapis.com.au"],
  jp: ["https://accounts.zoho.jp", "https://www.zohoapis.jp"],
  ca: ["https://accounts.zohocloud.ca", "https://www.zohoapis.ca"],
});

export class ZohoError extends Error {
  constructor(code, { retryable = false, ambiguous = false, retryAfter = 0 } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
    this.retryAfter = retryAfter;
  }
}

export const retryDelay = (attempt, retryAfter = 0, random = Math.random) =>
  Math.max(retryAfter, Math.min(3600000, 1000 * 2 ** Math.min(attempt, 12)) * (0.5 + random() * 0.5));

export const booksClient = async (connection, method, path, { data, params = {}, organization = true } = {}) => {
  const domains = REGIONS[connection.region];
  if (!domains || !/^[a-z]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) throw new ZohoError("INVALID_ZOHO_ENDPOINT");
  if (organization && !/^\d+$/.test(connection.organization_id || "")) throw new ZohoError("ORGANIZATION_REQUIRED");
  const url = new URL(`${domains[1]}/books/v3/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  if (organization) url.searchParams.set("organization_id", connection.organization_id);
  for (let attempt = 0; attempt < 2; attempt++) {
    await reserveRequestSlot(connection);
    const token = await getAccessToken(connection, attempt === 1);
    let response;
    let payload;
    try {
      response = await fetch(url, {
        method, redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      payload = await response.json();
    } catch {
      throw new ZohoError("ZOHO_NETWORK_OR_INVALID_RESPONSE", { retryable: true, ambiguous: method !== "GET" });
    }
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok || Number(payload.code || 0) !== 0) {
      const header = response.headers.get("retry-after");
      const retryAfter = header ? Math.max(0, Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
      throw new ZohoError(`ZOHO_HTTP_${response.status}_CODE_${String(payload.code ?? "UNKNOWN").replace(/[^\w-]/g, "").slice(0, 30)}`, {
        retryable: response.status === 429 || response.status >= 500,
        ambiguous: method !== "GET" && response.status >= 500,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0,
      });
    }
    return payload;
  }
};
