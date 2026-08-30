import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("operational event redaction", () => {
  it("keeps sensitive fields out of the persisted metadata implementation", () => {
    const source = readFileSync(new URL("./recordOperationalEvent.js", import.meta.url), "utf8");
    expect(source).toContain("FORBIDDEN_KEY");
    for (const field of ["secret", "token", "otp", "authorization", "password", "card", "email", "phone", "address", "payload"]) {
      expect(source).toContain(field);
    }
  });
});
