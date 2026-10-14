import { beforeEach, expect, it, vi } from "vitest";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import SearchEvent from "../../models/SearchEvent.js";
import { editDistance, resetSuggestVocabulary, suggestAlternatives, suggestAlternativeGroups, suggestFromShoppers, suggestFullForms } from "./suggest.js";
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

it("expands abbreviations to phrases the catalog uses", async () => {
  Product.find.mockReturnValue(rows(["Lithium Ion Battery 18650", "Lithium Ion Charger", "Light Bulb", "Battery Management System 4S", "Lipo Battery"]));
  Category.find.mockReturnValue(rows(["Batteries"]));
  expect(await suggestFullForms("li ion")).toEqual(["lithium ion"]);
  expect(await suggestFullForms("bms")).toEqual(["battery management system"]);
  expect(await suggestFullForms("lithium ion")).toEqual([]);
});

it("suggests searches whose shoppers picked the same products, not narrower ones", async () => {
  SearchEvent.distinct = vi.fn().mockResolvedValue(["p1", "p2"]);
  SearchEvent.aggregate = vi.fn().mockResolvedValue([{ _id: "lithium ion" }, { _id: "li ion battery" }, { _id: "18650 cell" }, { _id: "ion" }]);
  expect(await suggestFromShoppers("li ion")).toEqual(["lithium ion", "18650 cell"]);
  expect(SearchEvent.distinct).toHaveBeenCalledWith("product_id", { query: "li ion", product_id: { $nin: [null, ""] } });
});

it("combines kinds with reasons and no duplicates", async () => {
  Product.find.mockReturnValue(rows(["Lithium Ion Battery", "Lithium Ion Charger"]));
  SearchEvent.distinct = vi.fn().mockResolvedValue(["p1"]);
  SearchEvent.aggregate = vi.fn().mockResolvedValue([{ _id: "lithium ion" }, { _id: "18650 cell" }]);
  expect(await suggestAlternativeGroups("li ion")).toEqual([
    { term: "lithium ion", reason: "full_form" },
    { term: "18650 cell", reason: "shoppers" },
  ]);
});
