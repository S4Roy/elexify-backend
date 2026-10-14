import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import { booksClient } from "./ZohoBooksClient.js";
import { findExact } from "./ZohoMappingService.js";
import { syncItem } from "./ZohoItemService.js";
import { applyProductHsn, compareProductHsn, suggestDirection } from "./ZohoHsnSync.js";

vi.mock("../../models/Product.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ProductVariation.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./ZohoMappingService.js", () => ({ findExact: vi.fn() }));
vi.mock("./ZohoItemService.js", () => ({ syncItem: vi.fn() }));
vi.mock("./ZohoBooksClient.js", async (original) => ({ ...await original(), booksClient: vi.fn() }));

const connection = { organization_id: "org" };
const lean = (value) => ({ lean: async () => value, sort: () => ({ lean: async () => value }) });
const zohoItems = { "1": { item_id: "1", sku: "SI-1", hsn_or_sac: "85151100" }, "2": { item_id: "2", sku: "MM-RED", hsn_or_sac: "90303100" } };

beforeEach(() => {
  vi.clearAllMocks();
  booksClient.mockImplementation(async (_c, _m, path) => ({ item: zohoItems[path.split("/")[1]] }));
  findExact.mockImplementation(async (_c, _p, { sku }) => Object.values(zohoItems).find((item) => item.sku === sku) || null);
});

describe("suggestDirection", () => {
  it("pulls when only Zoho has a code, pushes when only we do, asks when both differ", () => {
    expect(suggestDirection({ ours: null, zoho: "8515", inZoho: true })).toBe("pull");
    expect(suggestDirection({ ours: "8515", zoho: null, inZoho: true })).toBe("push");
    expect(suggestDirection({ ours: "8515", zoho: null, inZoho: false })).toBe("push");
    expect(suggestDirection({ ours: "8515", zoho: "8516", inZoho: true })).toBe("review");
    expect(suggestDirection({ ours: "8515", zoho: "8515", inZoho: true })).toBe("none");
    expect(suggestDirection({ ours: null, zoho: "85A", inZoho: true })).toBe("none");
  });
});

describe("product HSN sync", () => {
  it("compares a simple product with its Zoho item found by SKU", async () => {
    Product.findOne.mockReturnValue(lean({ _id: "p1", name: "Soldering Iron", type: "simple", sku: "SI-1" }));
    const { rows } = await compareProductHsn(connection, "p1");
    expect(rows).toEqual([expect.objectContaining({ kind: "item", sku: "SI-1", ours: null, zoho: "85151100", in_zoho: true, suggested: "pull" })]);
  });

  it("compares each variation, using the product's code when the variation has none", async () => {
    Product.findOne.mockReturnValue(lean({ _id: "p2", name: "Multimeter", type: "variable", hsn_sac: "9030" }));
    ProductVariation.find.mockReturnValue(lean([{ _id: "v1", sku: "MM-RED" }, { _id: "v2", sku: "MM-NEW", hsn_sac: "903033" }]));
    const { rows } = await compareProductHsn(connection, "p2");
    expect(rows[0]).toMatchObject({ kind: "variation", ours: "9030", inherited: true, zoho: "90303100", suggested: "review" });
    expect(rows[1]).toMatchObject({ ours: "903033", in_zoho: false, suggested: "push" });
  });

  it("pulls Zoho's code into our database and pushes ours through the item sync", async () => {
    Product.findOne.mockReturnValue(lean({ _id: "p2", name: "Multimeter", type: "variable", hsn_sac: "9030" }));
    ProductVariation.find.mockReturnValue(lean([{ _id: "v1", sku: "MM-RED" }, { _id: "v2", sku: "MM-NEW", hsn_sac: "903033" }]));
    syncItem.mockResolvedValue("77");
    const { results } = await applyProductHsn(connection, "p2", [
      { entity_id: "v1", direction: "pull" }, { entity_id: "v2", direction: "push" }, { entity_id: "x", direction: "pull" }]);
    expect(ProductVariation.updateOne).toHaveBeenCalledWith({ _id: "v1" }, { $set: { hsn_sac: "90303100" } });
    expect(syncItem).toHaveBeenCalledWith(connection, "v2", true);
    expect(results).toEqual([
      expect.objectContaining({ ok: true, direction: "pull", hsn: "90303100" }),
      expect.objectContaining({ ok: true, direction: "push", hsn: "903033", zoho_item_id: "77" }),
      expect.objectContaining({ ok: false, error: "Not part of this product" }),
    ]);
  });

  it("refuses to pull a missing code and to push when we have none", async () => {
    Product.findOne.mockReturnValue(lean({ _id: "p3", name: "Tip", type: "simple", sku: "TIP-9" }));
    const pull = await applyProductHsn(connection, "p3", [{ entity_id: "p3", direction: "pull" }]);
    expect(pull.results[0]).toMatchObject({ ok: false, error: "ZOHO_HSN_MISSING_OR_INVALID" });
    const push = await applyProductHsn(connection, "p3", [{ entity_id: "p3", direction: "push" }]);
    expect(push.results[0]).toMatchObject({ ok: false, error: "PRODUCT_HSN_REQUIRED" });
    expect(syncItem).not.toHaveBeenCalled();
  });
});
