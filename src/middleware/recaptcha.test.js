import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRecaptcha } from "./recaptcha.js";
import { getRecaptchaConfig } from "../services/recaptcha/config.js";
import { verifyRecaptcha } from "../services/recaptcha/verify.js";
import { isSuspiciousCheckout } from "../services/recaptcha/checkoutRisk.js";
import { recordOperationalEvent } from "../services/observability/recordOperationalEvent.js";
vi.mock("../services/recaptcha/config.js", () => ({ getRecaptchaConfig: vi.fn() }));
vi.mock("../services/recaptcha/verify.js", () => ({ verifyRecaptcha: vi.fn() }));
vi.mock("../services/recaptcha/checkoutRisk.js", () => ({ isSuspiciousCheckout: vi.fn() }));
vi.mock("../services/observability/recordOperationalEvent.js", () => ({ recordOperationalEvent: vi.fn() }));
const config = { mode: "enforce", protect_contact: "true", protect_checkout: "true" };
const run = async (action = "contact", token) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn();
  await requireRecaptcha(action)({ headers: { "x-recaptcha-token": token } }, res, next);
  return { res, next };
};
beforeEach(() => {
  vi.resetAllMocks(); getRecaptchaConfig.mockResolvedValue(config);
  verifyRecaptcha.mockResolvedValue({ valid: true, reason: "accepted" });
  isSuspiciousCheckout.mockResolvedValue(false); recordOperationalEvent.mockResolvedValue({});
});
describe("form protection", () => {
  it("allows disabled protection and action switches", async () => {
    getRecaptchaConfig.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...config, protect_contact: "false" });
    expect((await run()).next).toHaveBeenCalled(); expect((await run()).next).toHaveBeenCalled();
    expect(verifyRecaptcha).not.toHaveBeenCalled();
  });
  it("does not verify normal checkout", async () => {
    expect((await run("checkout")).next).toHaveBeenCalled(); expect(verifyRecaptcha).not.toHaveBeenCalled();
  });
  it("challenges suspicious checkout before running any business handler", async () => {
    isSuspiciousCheckout.mockResolvedValue(true);
    const { res, next } = await run("checkout");
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "RECAPTCHA_REQUIRED", action: "checkout" }));
    expect(verifyRecaptcha).not.toHaveBeenCalled();
    expect((await run("checkout", "token")).next).toHaveBeenCalled();
  });
  it.each(["missing_token", "low_score", "invalid_token", "provider_unavailable"])("blocks %s in enforce mode", async reason => {
    verifyRecaptcha.mockResolvedValue({ valid: false, reason });
    const { res, next } = await run();
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(reason === "provider_unavailable" ? 503 : 403);
  });
  it("records failures but permits requests in monitor mode", async () => {
    getRecaptchaConfig.mockResolvedValue({ ...config, mode: "monitor" });
    verifyRecaptcha.mockResolvedValue({ valid: false, reason: "low_score", score: 0.1 });
    expect((await run("contact", "private-token")).next).toHaveBeenCalled();
    expect(JSON.stringify(recordOperationalEvent.mock.calls)).not.toContain("private-token");
  });
  it("does not bypass protection when settings or risk storage fails", async () => {
    getRecaptchaConfig.mockRejectedValueOnce(Error());
    expect((await run()).res.status).toHaveBeenCalledWith(503);
    isSuspiciousCheckout.mockRejectedValueOnce(Error());
    expect((await run("checkout")).res.status).toHaveBeenCalledWith(503);
  });
});
