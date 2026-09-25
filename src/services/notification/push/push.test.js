import { afterEach, describe, expect, it, vi } from "vitest";
import { pushConfig, eligibleEnvironmentUser } from "./config.js";
import { classifyFcmFailure } from "./fcm.js";
import { resolvePushTemplate, validRoute } from "./templates.js";
import { createConfirmation, verifyConfirmation } from "./campaigns.js";
afterEach(() => vi.unstubAllEnvs());
describe("push security and contracts", () => {
  it("fails closed without explicit environment configuration", () => {
    vi.stubEnv("PUSH_ENABLED", "true");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("FCM_ENVIRONMENT", "production");
    expect(pushConfig().enabled).toBe(false);
  });
  it("requires isolated nonproduction projects and recipient allowlist", () => {
    vi.stubEnv("PUSH_ENABLED", "true");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("FCM_ENVIRONMENT", "staging");
    vi.stubEnv("FCM_PROJECT_ID", "stage");
    vi.stubEnv("FCM_PRODUCTION_PROJECT_ID", "prod");
    vi.stubEnv("PUSH_TEST_USER_IDS", "alice");
    expect(eligibleEnvironmentUser("alice")).toBe(true);
    expect(eligibleEnvironmentUser("bob")).toBe(false);
    vi.stubEnv("FCM_PROJECT_ID", "prod");
    expect(pushConfig().enabled).toBe(false);
  });
  it("rejects unsafe routes and uses database order IDs without exposing order data", () => {
    for (const route of [
      "https://evil.com",
      "//evil.com",
      "/orders/../account",
      "/products/a?token=secret",
      "/orders/%2f%2fevil",
    ])
      expect(validRoute(route)).toBe(false);
    const n = resolvePushTemplate("ORDER_SHIPPED", {
      order_id: "ORD-123",
      order_entity_id: "a".repeat(24),
      address: "secret",
      grand_total: 100,
    });
    expect(n.route).toBe(`/orders/${"a".repeat(24)}`);
    expect(JSON.stringify(n)).not.toContain("secret");
    expect(
      resolvePushTemplate("ORDER_SHIPPED", { order_id: "ORD-123" }).route
    ).toBe("/orders");
    expect(resolvePushTemplate("INVENTED_STATE")).toBeNull();
  });
  it("only deactivates explicit unregistered tokens, retries transient FCM errors", () => {
    expect(
      classifyFcmFailure(400, { error: { status: "INVALID_ARGUMENT" } })
    ).toMatchObject({ invalid: false, retry: false });
    expect(
      classifyFcmFailure(404, {
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
              errorCode: "UNREGISTERED",
            },
          ],
        },
      })
    ).toMatchObject({ invalid: true, retry: false });
    expect(classifyFcmFailure(429, {})).toMatchObject({ retry: true });
    expect(classifyFcmFailure(503, {})).toMatchObject({ retry: true });
  });
  it("binds preview confirmation to campaign, actor, count and expiry", () => {
    vi.stubEnv("PUSH_CONFIRMATION_SECRET", "x".repeat(32));
    const token = createConfirmation("campaign", "admin", 120);
    expect(verifyConfirmation(token, "campaign", "admin").count).toBe(120);
    expect(verifyConfirmation(token, "other", "admin")).toBeNull();
    expect(verifyConfirmation(token, "campaign", "other")).toBeNull();
    expect(verifyConfirmation(`${token}a`, "campaign", "admin")).toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60000);
    expect(verifyConfirmation(token, "campaign", "admin")).toBeNull();
    vi.restoreAllMocks();
  });
});
