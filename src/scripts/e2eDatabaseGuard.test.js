import { describe, expect, it } from "vitest";
import { assertSafeE2EDatabase } from "./e2eDatabaseGuard.js";

describe("E2E database destructive guard", () => {
  const allowed = { E2E_ALLOW_DESTRUCTIVE_SEED: "true" };
  it("accepts only an explicitly authorized local E2E database", () => {
    expect(assertSafeE2EDatabase("mongodb://127.0.0.1:27017/elexify_e2e", allowed).database).toBe("elexify_e2e");
  });
  it.each([
    ["missing opt-in", "mongodb://127.0.0.1:27017/elexify_e2e", {}],
    ["remote host", "mongodb://db.example.com/elexify_e2e", allowed],
    ["wrong database", "mongodb://127.0.0.1:27017/elexify", allowed],
    ["production-like name", "mongodb://127.0.0.1:27017/elexify_e2e_production", allowed],
  ])("rejects %s", (_label, uri, env) => {
    expect(() => assertSafeE2EDatabase(uri, env)).toThrow(/Refusing E2E database mutation/);
  });
});

