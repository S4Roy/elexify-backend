import { describe, expect, it } from "vitest";
import { validateProductionEnv } from "./validateProductionEnv.js";

describe("production payment environment preflight", () => {
  it("does not impose production credentials in test/development", () => {
    expect(validateProductionEnv({ NODE_ENV: "test" })).toEqual([]);
  });

  it("reports every missing production payment value without exposing secrets", () => {
    expect(() => validateProductionEnv({ NODE_ENV: "production" })).toThrow(
      "missing RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_ACCOUNT_ID",
    );
  });

  it("rejects test keys in production", () => {
    expect(() => validateProductionEnv({
      NODE_ENV: "production", RAZORPAY_KEY_ID: "rzp_test_example",
      RAZORPAY_KEY_SECRET: "secret", RAZORPAY_WEBHOOK_SECRET: "webhook", RAZORPAY_ACCOUNT_ID: "acct_1",
    })).toThrow("live-mode key");
  });
});

