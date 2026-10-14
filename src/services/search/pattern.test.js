import { afterEach, expect, it } from "vitest";
import { searchPattern } from "./pattern.js";
const matches = (terms, text) => new RegExp(searchPattern(terms), "i").test(text);

afterEach(() => { delete process.env.SEARCH_FLEXIBLE_SEPARATORS; });

it("treats spaces, hyphens and underscores between words as optional", () => {
  for (const name of ["E-Cycle Kit", "ecycle kit", "e cycle", "E_cycle", "e - cycle"]) expect(matches(["e cycle"], name)).toBe(true);
  expect(matches(["li ion"], "18650 Li-ion Cell")).toBe(true);
  expect(matches(["e-cycle"], "ecycle")).toBe(true);
  expect(matches(["e cycle"], "e.cycle")).toBe(false);
});

it("keeps every match the old literal search found", () => {
  for (const [term, name] of [["bms", "4S BMS"], ["TS to TS 6.35mm (1/4\")", "TS to TS 6.35mm (1/4\") cable"], ["  battery  ", "battery"]]) {
    expect(matches([term], name)).toBe(true);
  }
  expect(matches(["6.35mm"], "6x35mm")).toBe(false);
  expect(matches(["(1/4"], "1/4")).toBe(false);
});

it("joins synonym alternatives and can be switched off", () => {
  expect(searchPattern(["cuter", "cutter"])).toBe("cuter|cutter");
  expect(matches(["li ion", "lithium"], "Lithium pack")).toBe(true);
  process.env.SEARCH_FLEXIBLE_SEPARATORS = "false";
  expect(searchPattern(["e cycle"])).toBe("e cycle");
  expect(matches(["e cycle"], "e-cycle")).toBe(false);
});
