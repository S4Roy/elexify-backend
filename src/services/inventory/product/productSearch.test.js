import { describe, expect, it } from "vitest";
import { hsnStatusMatch, productSearchMatch, searchRankStage } from "./productSearch.js";

describe("productSearchMatch", () => {
  it("returns nothing for a blank search", () => {
    expect(productSearchMatch("  ")).toBeNull();
    expect(searchRankStage("")).toBeNull();
  });

  it("treats regex characters literally", () => {
    const { $or } = productSearchMatch("W.1 (x)");
    expect($or[0].name.$regex).toBe("W\\.1 \\(x\\)");
  });

  it("adds HSN prefix conditions only for digit searches", () => {
    expect(productSearchMatch("ELX-0227").$or.some((c) => "hsn_sac" in c)).toBe(false);
    const { $or } = productSearchMatch("8543 70");
    expect($or).toContainEqual({ hsn_sac: { $regex: "^854370" } });
    expect($or).toContainEqual({ variations: { $elemMatch: { hsn_sac: { $regex: "^854370" } } } });
  });
});

describe("hsnStatusMatch", () => {
  it("only accepts missing or present", () => {
    expect(hsnStatusMatch("other")).toBeNull();
    expect(hsnStatusMatch("missing").$expr.$and).toBeDefined();
    expect(hsnStatusMatch("present").$expr.$not).toBeDefined();
  });
});
