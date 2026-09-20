import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ZohoConnection from "../../models/ZohoConnection.js";
import ZohoOAuthState from "../../models/ZohoOAuthState.js";
import { beginAuthorization, completeAuthorization, getAccessToken, disconnect } from "./ZohoAuthService.js";
import { acquireLease } from "./ZohoLease.js";

vi.mock("../../models/ZohoConnection.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ZohoOAuthState.js", () => ({ default: { create: vi.fn(), findOneAndDelete: vi.fn() } }));
vi.mock("../../models/Token.js", () => ({ default: { updateOne: vi.fn().mockResolvedValue({}) } }));
vi.mock("../integrationCredentials/index.js", () => ({ getIntegrationConfig: vi.fn().mockResolvedValue({ client_id: "client", client_secret: "secret" }) }));
vi.mock("../../utils/integrationCredentialsCrypto.js", () => ({ encryptCredential: value => `encrypted:${value}`, decryptCredential: value => value.replace("encrypted:", "") }));
vi.mock("./ZohoLease.js", () => ({ acquireLease: vi.fn(), releaseLease: vi.fn().mockResolvedValue({}) }));
const query = value => ({ select: vi.fn().mockResolvedValue(value) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ZOHO_REDIRECT_URI", "https://admin.example.test/settings/integrations/zoho-books");
  acquireLease.mockResolvedValue({ key: "zoho-auth", owner: "test" });
  ZohoConnection.updateOne.mockResolvedValue({ matchedCount: 1 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600, api_domain: "https://www.zohoapis.in" }) }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Zoho OAuth", () => {
  it("stores a hashed single-use state bound to the initiating admin", async () => {
    const url = new URL(await beginAuthorization("admin1", "in"));
    const stored = ZohoOAuthState.create.mock.calls[0][0];
    expect(stored.actor_id).toBe("admin1");
    expect(stored.digest).not.toBe(url.searchParams.get("state"));
    expect(stored.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(url.origin).toBe("https://accounts.zoho.in");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.ZOHO_REDIRECT_URI);
    expect(stored.expires_at.getTime()).toBeGreaterThan(Date.now());
  });
  it("rejects expired or reused OAuth states before token exchange", async () => {
    ZohoOAuthState.findOneAndDelete.mockResolvedValue(null);
    await expect(completeAuthorization("other-admin", "state", "code")).rejects.toThrow("INVALID_OR_EXPIRED_OAUTH_STATE");
    expect(ZohoOAuthState.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({ actor_id: "other-admin", expires_at: expect.any(Object) }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("encrypts exchanged credentials and leaves automatic sync disabled", async () => {
    ZohoOAuthState.findOneAndDelete.mockResolvedValue({ region: "in" });
    ZohoConnection.findOne.mockResolvedValue(null);
    await completeAuthorization("admin", "state", "code");
    expect(ZohoConnection.updateOne).toHaveBeenCalledWith({ key: "books" }, expect.objectContaining({ $set: expect.objectContaining({
      access_token: "encrypted:access", refresh_token: "encrypted:refresh", connected: true, enabled: false,
    }) }), { upsert: true });
  });
  it("does not refresh a valid token", async () => {
    ZohoConnection.findOne.mockReturnValue(query({ access_token: "encrypted:cached", expires_at: new Date(Date.now() + 120000) }));
    expect(await getAccessToken({ generation: 1 })).toBe("cached");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("serializes refresh across workers", async () => {
    ZohoConnection.findOne.mockReturnValue(query({ expires_at: new Date(0) }));
    acquireLease.mockResolvedValue(null);
    await expect(getAccessToken({ generation: 1 })).rejects.toMatchObject({ code: "ZOHO_REFRESH_BUSY", retryable: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cannot return tokens after disconnect or credential generation change", async () => {
    ZohoConnection.findOne.mockReturnValue(query(null));
    await expect(getAccessToken({ generation: 1 })).rejects.toThrow("ZOHO_DISCONNECTED");
  });
  it("rejects an unexpected API domain without saving tokens", async () => {
    ZohoOAuthState.findOneAndDelete.mockResolvedValue({ region: "in" });
    ZohoConnection.findOne.mockResolvedValue(null);
    fetch.mockResolvedValue({ ok: true, json: async () => ({ access_token: "secret", refresh_token: "secret", expires_in: 3600, api_domain: "https://attacker.test" }) });
    await expect(completeAuthorization("admin", "state", "code")).rejects.toThrow("INVALID_ZOHO_TOKEN_RESPONSE");
    expect(ZohoConnection.updateOne).not.toHaveBeenCalled();
  });
  it("pauses locally and preserves encrypted revocation work when Zoho is unavailable", async () => {
    ZohoConnection.findOne.mockReturnValue(query({ region: "in", refresh_token: "encrypted:refresh" }));
    fetch.mockRejectedValue(new Error("offline"));
    await expect(disconnect()).rejects.toThrow("ZOHO_OAUTH_UNAVAILABLE");
    expect(ZohoConnection.updateOne).toHaveBeenNthCalledWith(1, { key: "books" }, expect.objectContaining({ $set: { connected: false, enabled: false } }));
    expect(ZohoConnection.updateOne).toHaveBeenNthCalledWith(2, { key: "books" }, expect.objectContaining({ $set: { revocation_token: "encrypted:refresh", revocation_pending: true } }));
  });
});
