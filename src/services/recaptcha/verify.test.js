import { describe, it, expect, vi } from "vitest";
import { verifyRecaptcha } from "./verify.js";
const now = Date.now();
const config = { secret_key: "private", threshold: 0.5, hosts: ["shop.example.com"] };
const valid = { success: true, score: 0.9, action: "contact", hostname: "shop.example.com", challenge_ts: new Date(now).toISOString() };
const check = async (override = {}) => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...valid, ...override }) });
  return { result: await verifyRecaptcha(config, "contact", "fresh-token", { fetchImpl, now }), fetchImpl };
};
describe("reCAPTCHA server verification", () => {
  it("verifies with a POST body and accepts a matching action/domain/score", async () => {
    const { result, fetchImpl } = await check();
    expect(result).toEqual({ valid: true, reason: "accepted", score: 0.9 });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(request.method).toBe("POST");
    expect(request.body.get("secret")).toBe("private");
    expect(request.body.get("response")).toBe("fresh-token");
  });
  it.each([
    [{ success: false, "error-codes": ["timeout-or-duplicate"] }, "invalid_token"],
    [{ action: "login" }, "action_mismatch"],
    [{ hostname: "evil.example.com" }, "hostname_mismatch"],
    [{ hostname: "shop.example.com.evil.com" }, "hostname_mismatch"],
    [{ score: 0.1 }, "low_score"], [{ score: "0.9" }, "invalid_score"],
    [{ score: 2 }, "invalid_score"], [{ challenge_ts: "invalid" }, "expired_token"],
    [{ challenge_ts: new Date(now - 121000).toISOString() }, "expired_token"],
    [{ challenge_ts: new Date(now + 60000).toISOString() }, "expired_token"],
  ])("rejects invalid provider results %j", async (override, reason) => {
    expect((await check(override)).result).toMatchObject({ valid: false, reason });
  });
  it("rejects absent/oversized tokens without calling Google", async () => {
    const fetchImpl = vi.fn();
    for (const token of [undefined, [], "x".repeat(4097)]) expect(await verifyRecaptcha(config, "contact", token, { fetchImpl })).toEqual({ valid: false, reason: "missing_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("handles provider timeout and non-JSON errors", async () => {
    for (const fetchImpl of [vi.fn().mockRejectedValue(new Error("timeout")), vi.fn().mockResolvedValue({ ok: false }), vi.fn().mockResolvedValue({ ok: true, json: async () => { throw Error(); } })]) {
      expect(await verifyRecaptcha(config, "contact", "token", { fetchImpl })).toEqual({ valid: false, reason: "provider_unavailable" });
    }
  });
});
