import { beforeEach, expect, it, vi } from "vitest";
import SearchSynonym from "../../models/SearchSynonym.js";
import { invalidateSynonyms, parseSynonym, searchTerms } from "./synonyms.js";
vi.mock("../../models/SearchSynonym.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../models/SearchEvent.js", () => ({ default: {} }));
const rows = rows => ({ lean: () => Promise.resolve(rows) });

beforeEach(() => { invalidateSynonyms(); SearchSynonym.find.mockReset(); });

it("expands a normalized whole query and keeps the raw key first", async () => {
  SearchSynonym.find.mockReturnValue(rows([{ term: "li ion", alternatives: ["li-ion", "lithium"] }]));
  expect(await searchTerms("  Li   ION ")).toEqual(["  Li   ION ", "li-ion", "lithium"]);
  expect(await searchTerms("li ion battery")).toEqual(["li ion battery"]);
  expect(SearchSynonym.find).toHaveBeenCalledTimes(1);
});

it("reloads after invalidation and falls back to the raw key on failure", async () => {
  SearchSynonym.find.mockReturnValue(rows([]));
  await searchTerms("cuter");
  invalidateSynonyms();
  SearchSynonym.find.mockReturnValue({ lean: () => Promise.reject(new Error("down")) });
  expect(await searchTerms("cuter")).toEqual(["cuter"]);
});

it("validates and normalizes synonym input", () => {
  expect(parseSynonym({ term: " E Cycle ", alternatives: ["ecycle", "E-Cycle", "e cycle", "ECYCLE", ""] }))
    .toEqual({ term: "e cycle", alternatives: ["ecycle", "e-cycle"] });
  expect(parseSynonym({ term: "x", alternatives: ["x"] }).error).toMatch(/at least one/);
  expect(parseSynonym({ term: "", alternatives: ["y"] }).error).toMatch(/Term/);
  expect(parseSynonym({ term: "x", alternatives: "y" }).error).toMatch(/list/);
  expect(parseSynonym({ term: "x", alternatives: Array.from({ length: 11 }, (_, i) => `a${i}`) }).error).toMatch(/At most/);
});
