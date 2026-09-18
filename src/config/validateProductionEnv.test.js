import { describe, expect, it } from "vitest";
import { validateProductionRazorpayConfig } from "./validateProductionEnv.js";

const complete = {
  key_id: "rzp_live_example",
  key_secret: "secret",
  webhook_secret: "webhook",
  account_id: "acct_1",
};

describe("production Razorpay configuration", () => {
  it("allows development to use test credentials", () => {
    const testConfig = { key_id: "rzp_test_example", key_secret: "secret" };
    expect(validateProductionRazorpayConfig(testConfig, { NODE_ENV: "test" })).toBe(testConfig);
  });

  it("accepts complete live managed credentials without Razorpay environment variables", () => {
    expect(validateProductionRazorpayConfig(complete, { NODE_ENV: "production" })).toBe(complete);
  });

  it("rejects incomplete production credentials without exposing values", () => {
    expect(() => validateProductionRazorpayConfig({ key_id: complete.key_id }, { NODE_ENV: "production" }))
      .toThrow("missing key_secret, webhook_secret, account_id");
  });

  it("rejects test keys in production", () => {
    expect(() => validateProductionRazorpayConfig({ ...complete, key_id: "rzp_test_example" }, { NODE_ENV: "production" }))
      .toThrow("live-mode key");
  });
});
