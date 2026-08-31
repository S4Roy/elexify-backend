import { describe, expect, it } from "vitest";
import { maskEmail, maskMobile } from "./maskContact.js";

describe("maskEmail", () => {
  it("masks the local part, keeps the domain", () => {
    expect(maskEmail("subhankar@gmail.com")).toBe("s***@gmail.com");
  });

  it("never returns the full identifier", () => {
    const email = "someone@example.com";
    expect(maskEmail(email)).not.toBe(email);
  });

  it("returns null for invalid input", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
    expect(maskEmail("not-an-email")).toBeNull();
  });
});

describe("maskMobile", () => {
  it("keeps only the last 4 digits, with country code prefix", () => {
    expect(maskMobile("9876543210", "91")).toBe("+91 ******3210");
  });

  it("omits the prefix when no phone code is given", () => {
    expect(maskMobile("9876543210")).toBe("******3210");
  });

  it("never returns the full identifier", () => {
    expect(maskMobile("9876543210", "91")).not.toContain("987654");
  });

  it("returns null for invalid input", () => {
    expect(maskMobile(null)).toBeNull();
    expect(maskMobile("")).toBeNull();
  });
});
