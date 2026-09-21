import { describe, it, expect, vi, beforeEach } from "vitest";
import { RECAPTCHA_DEFAULTS, validateRecaptchaConfig, getRecaptchaConfig, publicRecaptchaConfig } from "./config.js";
import { getIntegrationConfig } from "../integrationCredentials/index.js";
vi.mock("../integrationCredentials/index.js", () => ({ getIntegrationConfig: vi.fn() }));
const settings = { ...RECAPTCHA_DEFAULTS, site_key: "public-site-key", secret_key: "secret", allowed_hostnames: "shop.example.com,www.shop.example.com" };
beforeEach(() => vi.resetAllMocks());
describe("reCAPTCHA settings", () => {
  it("remains disabled without managed credentials", async () => {
    getIntegrationConfig.mockResolvedValue(null);
    expect(await getRecaptchaConfig()).toBeNull();
    expect(getIntegrationConfig).toHaveBeenCalledWith("recaptcha", null);
  });
  it.each([{ secret_key: "" }, { score_threshold: "NaN" }, { score_threshold: "1.1" }, { mode: "invalid" }, { checkout_attempts: "1" }, { allowed_hostnames: "https://shop.example.com" }, { allowed_hostnames: "*.example.com" }, { allowed_hostnames: "" }, { protect_login: "yes" }])("rejects invalid configuration %j", override => {
    expect(() => validateRecaptchaConfig({ ...settings, ...override })).toThrow();
  });
  it("publishes only the key and action switches", async () => {
    getIntegrationConfig.mockResolvedValue({ ...settings, protect_login: "false" });
    const res = { set: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis() };
    await publicRecaptchaConfig({}, res);
    const data = res.json.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["actions", "enabled", "mode", "site_key"]);
    expect(data.actions).not.toContain("login");
    expect(JSON.stringify(data)).not.toContain("secret");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
