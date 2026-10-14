import { beforeEach, expect, it, vi } from "vitest";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import { editDistance, resetSuggestVocabulary, suggestAlternatives } from "./suggest.js";
vi.mock("../../models/Product.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../models/Category.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../models/SearchEvent.js", () => ({ default: {} }));
const rows = names => ({ lean: () => Promise.resolve(names.map(name => ({ name }))) });

beforeEach(() => {
  resetSuggestVocabulary();
  vi.clearAllMocks();
  Product.find.mockReturnValue(rows(["Wire Cutter 5 inch", "Wire Stripper Cutter", "Drone Motor 2205", "Ecycle Conversion Kit", "Speaker 4 inch", "Speaker 6 inch"]));
  Category.find.mockReturnValue(rows(["Speakers", "Motors"]));
});

it("measures edits with adjacent swaps as one and stops past the limit", () => {
  expect(editDistance("cuter", "cutter", 2)).toBe(1);
  expect(editDistance("motro", "motor", 2)).toBe(1);
  expect(editDistance("speaker", "transformer", 2)).toBe(3);
});

it("corrects misspelled words using live catalog words", async () => {
  expect(await suggestAlternatives("Cuter")).toEqual(["cutter"]);
  expect(await suggestAlternatives("drone moter")).toEqual(["drone motor", "drone motors"]);
  expect(await suggestAlternatives("speker")).toEqual(["speaker", "speakers"]);
});

it("offers the joined spelling and skips words the catalog already has", async () => {
  expect(await suggestAlternatives("e cycle")).toContain("ecycle");
  expect(await suggestAlternatives("drone motor")).toEqual([]);
  expect(await suggestAlternatives("2205")).toEqual([]);
  expect(Product.find).toHaveBeenCalledTimes(1);
  expect(Product.find.mock.calls[0][0]).toEqual({ deleted_at: null, status: "active" });
});
