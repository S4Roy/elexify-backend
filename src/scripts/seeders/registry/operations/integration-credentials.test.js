import { describe, expect, it } from "vitest";
import { configuredEnvironment } from "./integration-credentials.js";

describe("integration credentials environment import", () => {
  it("maps only supported, non-empty values exposed by config/envs.js", () => {
    const result = configuredEnvironment({
      shiprocket: { email: " ship-email ", password: "ship-secret" },
      google: { clientId: "" },
      unrelated: { secret: "must-not-be-read" },
    });
    expect(result).toEqual([{
      provider: "shiprocket",
      credentials: [["email", "ship-email"], ["password", "ship-secret"]],
    }]);
  });

  it("returns no work when supported variables are absent", () => {
    expect(configuredEnvironment({})).toEqual([]);
  });

  it("does not seed a provider from config defaults alone", () => {
    expect(configuredEnvironment({
      smtp: { port: 465, secure: true },
      zoho: { BASE_URL: "https://books.zoho.com/api/v3" },
    })).toEqual([]);
  });
});
