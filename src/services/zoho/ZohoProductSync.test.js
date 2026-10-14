import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import { booksClient } from "./ZohoBooksClient.js";
import { findExact } from "./ZohoMappingService.js";
import { syncItem } from "./ZohoItemService.js";
import { recordSource } from "./ZohoSourceChanges.js";
import { applyProduct, compareProduct, suggestField } from "./ZohoProductSync.js";

vi.mock("../../models/Product.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ProductVariation.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./ZohoMappingService.js", () => ({ findExact: vi.fn() }));
vi.mock("./ZohoItemService.js", () => ({ syncItem: vi.fn() }));
vi.mock("./ZohoSourceChanges.js", () => ({ sourceHash: vi.fn().mockResolvedValue("h"), recordSource: vi.fn() }));
vi.mock("./ZohoBooksClient.js", async (original) => ({ ...await original(), booksClient: vi.fn() }));

const connection = { organization_id: "org" };
const lean = (value) => ({ lean: async () => value, sort: () => ({ lean: async () => value }) });
let zoho;
const simple = { _id: "p1", type: "simple", name: "Soldering Iron", sku: "SI-1", regular_price: 2999, sale_price: 1499, hsn_sac: "8515", status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  zoho = { "1": { item_id: "1", sku: "SI-1", name: "Soldering Iron 60W", rate: 1499, unit: "nos", hsn_or_sac: null, status: "active" } };
  booksClient.mockImplementation(async (_c, method, path) => (method === "GET" ? { item: zoho[path.split("/")[1]] } : {}));
  findExact.mockImplementation(async (_c, _p, { sku }) => Object.values(zoho).find((item) => item.sku === sku) || null);
  Product.findOne.mockReturnValue(lean(simple));
});

const field = (row, key) => row.fields.find((f) => f.key === key);

describe("suggestField", () => {
  it("fills gaps automatically and leaves real differences for review", () => {
    expect(suggestField({ ours: null, zoho: "x", pullable: true, pushable: false })).toBe("pull");
    expect(suggestField({ ours: "x", zoho: null, pullable: false, pushable: true })).toBe("push");
    expect(suggestField({ ours: "a", zoho: "b", pullable: true, pushable: true })).toBe("review");
    expect(suggestField({ ours: 5, zoho: 5, pullable: true, pushable: true })).toBe("none");
  });
});

describe("compareProduct", () => {
  it("compares each synced field of a simple product with its Zoho item", async () => {
    const { rows: [row] } = await compareProduct(connection, "p1");
    expect(row).toMatchObject({ kind: "item", in_zoho: true, zoho_item_id: "1", sku_mismatch: false });
    expect(field(row, "name")).toMatchObject({ ours: "Soldering Iron", zoho: "Soldering Iron 60W", suggested: "review" });
    expect(field(row, "price")).toMatchObject({ ours: 1499, zoho: 1499, suggested: "none" });
    expect(field(row, "hsn")).toMatchObject({ ours: "8515", zoho: null, suggested: "push" });
    expect(field(row, "unit")).toMatchObject({ ours: "pcs", zoho: "nos", suggested: "review" });
  });

  it("offers creation for an item Zoho doesn't have", async () => {
    zoho = {};
    const { rows: [row] } = await compareProduct(connection, "p1");
    expect(row).toMatchObject({ in_zoho: false, can_create: true });
    expect(row.fields.every((f) => f.suggested === "none")).toBe(true);
  });

  it("builds a variation's name from the product and never pulls it", async () => {
    Product.findOne.mockReturnValue(lean({ _id: "p2", type: "variable", name: "Multimeter", hsn_sac: "9030" }));
    ProductVariation.find.mockReturnValue(lean([{ _id: "v1", sku: "SI-1", combination_display: "Red", regular_price: 1499, status: "active" }]));
    const { rows: [row] } = await compareProduct(connection, "p2");
    expect(field(row, "name")).toMatchObject({ ours: "Multimeter - Red", pullable: false });
    expect(field(row, "status")).toMatchObject({ pullable: false, pushable: false });
    expect(field(row, "hsn")).toMatchObject({ ours: "9030" });
  });
});

describe("applyProduct", () => {
  it("pulls into our product and pushes only the chosen fields, keeping Zoho's other values", async () => {
    const { results } = await applyProduct(connection, "p1", [{ entity_id: "p1", fields: { name: "pull", hsn: "push", unit: "pull" } }]);
    expect(results[0]).toMatchObject({ ok: true, pulled: { name: "Soldering Iron 60W", accounting_unit: "nos" }, pushed: ["hsn_or_sac"] });
    expect(booksClient).toHaveBeenCalledWith(connection, "PUT", "items/1", { data: { name: "Soldering Iron 60W", rate: 1499, unit: "nos", hsn_or_sac: "8515" } });
    expect(Product.updateOne).toHaveBeenCalledWith({ _id: "p1" }, { $set: expect.objectContaining({ name: "Soldering Iron 60W", accounting_unit: "nos", zoho_item_id: "1" }) });
    expect(recordSource).toHaveBeenCalledWith(connection, "item", "p1", "SI-1", "h");
  });

  it("pulls Zoho's rate into the sale price when one is set", async () => {
    zoho["1"].rate = 1299;
    const { results } = await applyProduct(connection, "p1", [{ entity_id: "p1", fields: { price: "pull" } }]);
    expect(results[0].pulled).toEqual({ sale_price: 1299 });
    expect(booksClient).not.toHaveBeenCalledWith(connection, "PUT", expect.anything(), expect.anything());
  });

  it("changes status in Zoho through its status endpoint", async () => {
    Product.findOne.mockReturnValue(lean({ ...simple, status: "inactive" }));
    await applyProduct(connection, "p1", [{ entity_id: "p1", fields: { status: "push" } }]);
    expect(booksClient).toHaveBeenCalledWith(connection, "POST", "items/1/inactive");
  });

  it("creates a missing item through the full item sync", async () => {
    zoho = {};
    syncItem.mockResolvedValue("9");
    const { results } = await applyProduct(connection, "p1", [{ entity_id: "p1", create: true }]);
    expect(syncItem).toHaveBeenCalledWith(connection, "p1", false);
    expect(results[0]).toMatchObject({ ok: true, created: true, zoho_item_id: "9" });
  });

  it("refuses a pull Zoho can't supply and rows from other products", async () => {
    const { results } = await applyProduct(connection, "p1", [
      { entity_id: "p1", fields: { hsn: "pull" } }, { entity_id: "x", fields: { name: "pull" } }]);
    expect(results[0]).toMatchObject({ ok: false, error: "HSN_CANNOT_PULL" });
    expect(results[1]).toMatchObject({ ok: false, error: "Not part of this product" });
    expect(Product.updateOne).not.toHaveBeenCalled();
  });
});
