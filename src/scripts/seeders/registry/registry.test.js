import { describe, expect, it } from "vitest";
import { buildRegistry, listOperations, getOperation, hasOperation } from "./index.js";

const validEntry = (overrides = {}) => ({
  key: "test-op",
  name: "Test Op",
  description: "A fake operation for registry validation tests.",
  type: "SEEDER",
  category: "test",
  version: 1,
  required: false,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["test"],
  dependencies: [],
  estimatedImpact: "none",
  supportsDryRun: false,
  requiresConfirmation: false,
  permission: "system.seeder.execute",
  handler: async () => ({ inserted: 0, updated: 0, skipped: 0, deleted: 0, warnings: [] }),
  ...overrides,
});

describe("data-operations registry validation", () => {
  it("accepts a well-formed entry", () => {
    expect(() => buildRegistry([validEntry()])).not.toThrow();
  });

  it("throws at build time on a duplicate key", () => {
    expect(() => buildRegistry([validEntry(), validEntry({ name: "Second" })])).toThrow(/Duplicate/i);
  });

  it("throws on a non-kebab-case key", () => {
    expect(() => buildRegistry([validEntry({ key: "Test_Op" })])).toThrow();
  });

  it("throws when a required string field is missing", () => {
    expect(() => buildRegistry([validEntry({ description: "" })])).toThrow(/description/);
  });

  it("throws when a required boolean field is not a boolean", () => {
    expect(() => buildRegistry([validEntry({ idempotent: "yes" })])).toThrow(/idempotent/);
  });

  it("throws on an unknown type", () => {
    expect(() => buildRegistry([validEntry({ type: "SCRIPT" })])).toThrow(/type/);
  });

  it("throws on an unknown risk level", () => {
    expect(() => buildRegistry([validEntry({ risk: "EXTREME" })])).toThrow(/risk/);
  });

  it("throws on an empty allowedEnvironments array", () => {
    expect(() => buildRegistry([validEntry({ allowedEnvironments: [] })])).toThrow(/allowedEnvironments/);
  });

  it("throws on an unrecognized environment name", () => {
    expect(() => buildRegistry([validEntry({ allowedEnvironments: ["staging"] })])).toThrow(/environment/);
  });

  it("throws when dependencies is not an array", () => {
    expect(() => buildRegistry([validEntry({ dependencies: "email-templates" })])).toThrow(/dependencies/);
  });

  it("throws when handler is not a function", () => {
    expect(() => buildRegistry([validEntry({ handler: "run.js" })])).toThrow(/handler/);
  });

  it("throws when healthCheck is present but not a function", () => {
    expect(() => buildRegistry([validEntry({ healthCheck: "check.js" })])).toThrow(/healthCheck/);
  });

  it("never treats a malformed handler value as an executable path — invalid input always throws rather than resolving to a script", () => {
    expect(() => buildRegistry([validEntry({ handler: "../../../etc/passwd" })])).toThrow();
  });
});

describe("the real production registry (seeders/registry/index.js)", () => {
  it("loaded successfully with no duplicate keys and every entry well-formed (module import already validated this)", () => {
    const operations = listOperations();
    expect(operations.length).toBeGreaterThan(15);
    const keys = operations.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("getOperation resolves a known key and returns undefined for an unknown one — never a path", () => {
    expect(getOperation("email-templates")).toBeTruthy();
    expect(getOperation("../../etc/passwd")).toBeUndefined();
    expect(getOperation("; rm -rf /")).toBeUndefined();
    expect(hasOperation("email-templates")).toBe(true);
    expect(hasOperation("not-a-real-key")).toBe(false);
  });

  it("every entry declares a permission string from the known dot-notation convention", () => {
    for (const entry of listOperations()) {
      expect(entry.permission).toMatch(/^system\.(seeder|migration|repair)\.execute$/);
    }
  });

  it("the non-idempotent order-schema-migration is CRITICAL risk and requires confirmation", () => {
    const entry = getOperation("order-schema-migration");
    expect(entry.idempotent).toBe(false);
    expect(entry.risk).toBe("CRITICAL");
    expect(entry.requiresConfirmation).toBe(true);
  });
});
