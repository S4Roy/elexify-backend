import { describe, expect, it } from "vitest";
import { hsnOrNull } from "./hsn.js";

describe("hsnOrNull", () => {
  it("keeps digits and drops spaces", () => {
    expect(hsnOrNull(" 8543 7099 ")).toBe("85437099");
  });

  it("returns null for blank values so the code is cleared", () => {
    expect(hsnOrNull("")).toBeNull();
    expect(hsnOrNull("   ")).toBeNull();
    expect(hsnOrNull(null)).toBeNull();
  });
});
