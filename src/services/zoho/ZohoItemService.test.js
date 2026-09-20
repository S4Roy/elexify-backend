import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import ZohoMapping from "../../models/ZohoMapping.js";
import { syncMapped } from "./ZohoMappingService.js";
import { syncItem } from "./ZohoItemService.js";

vi.mock("../../models/Product.js", () => ({ default: { findById: vi.fn(), countDocuments: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ProductVariation.js", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("../../models/ZohoMapping.js", () => ({ default: { exists: vi.fn(), findOne: vi.fn() } }));
vi.mock("./ZohoSourceChanges.js", () => ({ sourceHash: vi.fn().mockResolvedValue("hash"), recordSource: vi.fn() }));
vi.mock("./ZohoMappingService.js", () => ({ syncMapped: vi.fn(), findExact: vi.fn() }));
vi.mock("./ZohoBooksClient.js", async original => ({ ...await original(), booksClient: vi.fn() }));
const item = { _id: "item", type: "simple", name: "Product", sku: "SKU-1", regular_price: 100, sale_price: 80, status: "active", hsn_sac: "1234", accounting_unit: "pcs" };
const connection = { organization_id: "123" };

beforeEach(() => {
  vi.clearAllMocks();
  Product.findById.mockReturnValue({ lean: async () => item });
  Product.countDocuments.mockResolvedValue(0);
  ProductVariation.countDocuments.mockResolvedValue(0);
  ZohoMapping.exists.mockResolvedValue(null);
  ZohoMapping.findOne.mockReturnValue({ lean: async () => ({ remote_id: "1234" }) });
  syncMapped.mockResolvedValue({ item_id: "1234" });
});

describe("Zoho catalog synchronization", () => {
  it("maps SKU, sale price, unit and HSN without stock mutations", async () => {
    expect(await syncItem(connection, "item")).toBe("1234");
    expect(syncMapped).toHaveBeenCalledWith(expect.objectContaining({ identity: "SKU-1", payload: expect.objectContaining({ sku: "SKU-1", rate: 80, unit: "pcs", hsn_or_sac: "1234", item_type: "sales" }) }));
    expect(Product.updateOne).toHaveBeenCalledWith({ _id: "item" }, { $set: { zoho_item_id: "1234", zoho_organization_id: "123" } });
  });
  it("rejects cross-collection SKU collisions", async () => {
    ProductVariation.countDocuments.mockResolvedValue(1);
    await expect(syncItem(connection, "item")).rejects.toThrow("LOCAL_SKU_COLLISION");
    expect(syncMapped).not.toHaveBeenCalled();
  });
  it("does not silently substitute a changed SKU on an existing order", async () => {
    await expect(syncItem(connection, "item", false, "OLD-SKU")).rejects.toThrow("HISTORICAL_SKU_CHANGED_REVIEW_REQUIRED");
    expect(syncMapped).not.toHaveBeenCalled();
  });
  it("reuses unchanged mappings while ensuring order dependencies", async () => {
    expect(await syncItem(connection, "item", false, "SKU-1", true)).toBe("1234");
    expect(syncMapped).not.toHaveBeenCalled();
  });
});
