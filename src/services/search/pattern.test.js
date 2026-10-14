import { afterEach, describe, expect, it } from "vitest";
import { searchPattern, wordPatterns } from "./pattern.js";
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

describe("wordPatterns", () => {
  const matches = (term, text) => wordPatterns(term).every(p => new RegExp(p, "i").test(text));
  it("matches every word in any order", () => {
    expect(matches("12 0 12 transformer", "Transformer 12-0-12 2A")).toBe(true);
    expect(matches("12 0 12 transformer", "Step Down Transformer 12V")).toBe(false);
  });
  it("treats numbers as whole numbers and single letters as standalone", () => {
    expect(matches("12 transformer", "Transformer 120V")).toBe(false);
    expect(matches("0", "Amplifier 100W")).toBe(false);
    expect(matches("12 v", "12V Adapter")).toBe(true);
    expect(matches("v", "Valve")).toBe(false);
    expect(matches("6.35 jack", "TS Jack 6.35mm")).toBe(true);
  });
  it("matches word starts and ignores filler words", () => {
    expect(matches("speaker for car", "Car Speakers 6 inch")).toBe(true);
    expect(matches("ker", "Speaker")).toBe(false);
  });
});
