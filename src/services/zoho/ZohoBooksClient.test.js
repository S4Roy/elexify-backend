import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { booksClient, retryDelay } from "./ZohoBooksClient.js";
import { getAccessToken } from "./ZohoAuthService.js";

vi.mock("./ZohoAuthService.js", () => ({ getAccessToken: vi.fn() }));
vi.mock("./ZohoRateLimiter.js", () => ({ reserveRequestSlot: vi.fn().mockResolvedValue(undefined) }));
const connection = { region: "in", organization_id: "123", generation: 1 };
const response = (status, data, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data, headers: new Headers(headers) });

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue("secret-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, { code: 0, items: [] })));
});
afterEach(() => vi.unstubAllGlobals());

describe("Zoho Books transport", () => {
  it("pins the API host and organization", async () => {
    await booksClient(connection, "GET", "items", { params: { organization_id: "attacker" } });
    expect(String(fetch.mock.calls[0][0])).toBe("https://www.zohoapis.in/books/v3/items?organization_id=123");
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Zoho-oauthtoken secret-token" } });
  });
  it.each(["https://example.com", "../items", "items?token=secret", "items/%2e%2e"])('rejects unsafe path %s', async path => {
    await expect(booksClient(connection, "GET", path)).rejects.toThrow("INVALID_ZOHO_ENDPOINT");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refreshes only once on an explicit 401", async () => {
    fetch.mockResolvedValueOnce(response(401, { code: 57 }));
    await booksClient(connection, "GET", "items");
    expect(getAccessToken).toHaveBeenLastCalledWith(connection, true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("marks timed out creates as ambiguous without retrying", async () => {
    fetch.mockRejectedValueOnce(new Error("network failure containing secrets"));
    await expect(booksClient(connection, "POST", "items", { data: {} })).rejects.toMatchObject({ code: "ZOHO_NETWORK_OR_INVALID_RESPONSE", ambiguous: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains rate-limit delays without logging provider messages", async () => {
    fetch.mockResolvedValueOnce(response(429, { code: 45, message: "customer@example.com token=secret" }, { "Retry-After": "120" }));
    const error = await booksClient(connection, "GET", "items").catch(e => e);
    expect(error).toMatchObject({ code: "ZOHO_HTTP_429_CODE_45", retryable: true, retryAfter: 120000, ambiguous: false });
    expect(error.detail.message).toBe("cu***@example.com token: [REDACTED]");
  });
  it("keeps Zoho's reason for a rejected request", async () => {
    fetch.mockResolvedValueOnce(response(400, { code: 118068, message: "Invalid value passed for place_of_contact" }));
    await expect(booksClient(connection, "POST", "contacts")).rejects.toMatchObject({
      code: "ZOHO_HTTP_400_CODE_118068",
      detail: { http_status: 400, zoho_code: 118068, message: "Invalid value passed for place_of_contact", method: "POST", path: "contacts" },
    });
  });
  it("marks server-side write failures as ambiguous", async () => {
    fetch.mockResolvedValueOnce(response(503, { code: 1 }));
    await expect(booksClient(connection, "POST", "salesorders")).rejects.toMatchObject({ ambiguous: true, retryable: true });
  });
  it("honors Retry-After and bounds exponential backoff", () => {
    expect(retryDelay(2, 120000, () => 0)).toBe(120000);
    expect(retryDelay(100, 0, () => 1)).toBe(3600000);
    expect(retryDelay(2, 0, () => 0)).toBe(2000);
  });
});
