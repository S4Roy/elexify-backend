import { describe, expect, it } from "vitest";
import { redact, redactMessage } from "./redact.js";

describe("redact", () => {
  it("redacts a value whose key looks secret-shaped, regardless of value type", () => {
    const out = redact({ password: "hunter2", otp: 123456, apiKey: "abc", nested: { token: "xyz" } });
    expect(out.password).toBe("[REDACTED]");
    expect(out.otp).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.nested.token).toBe("[REDACTED]");
  });

  it("masks credentials embedded in a mongodb connection string, even inside free text", () => {
    const message = "Connecting to mongodb://admin:s3cr3t@cluster0.mongodb.net/prod";
    const out = redactMessage(message);
    expect(out).not.toContain("s3cr3t");
    expect(out).not.toContain("admin:s3cr3t");
    expect(out).toContain("mongodb://***:***@");
  });

  it("masks a bearer token in free text", () => {
    const out = redactMessage("Authorization header was: Bearer abcdef123456.token-value");
    expect(out).not.toContain("abcdef123456");
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("masks a JWT-shaped string", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const out = redactMessage(`token issued: ${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain("[REDACTED_JWT]");
  });

  it("masks an OTP-shaped number even with an innocuous surrounding message", () => {
    const out = redactMessage("Sending code: 482913 to user");
    expect(out).not.toContain("482913");
  });

  it("leaves ordinary log messages and non-secret data untouched", () => {
    expect(redactMessage("Created 5 missing template(s).")).toBe("Created 5 missing template(s).");
    expect(redact({ inserted: 5, skipped: 0 })).toEqual({ inserted: 5, skipped: 0 });
  });

  it("walks arrays and nested objects", () => {
    const out = redact([{ user: "a", password: "p1" }, { user: "b", secret: "p2" }]);
    expect(out[0].password).toBe("[REDACTED]");
    expect(out[1].secret).toBe("[REDACTED]");
    expect(out[0].user).toBe("a");
  });

  it("passes through null/undefined without throwing", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
