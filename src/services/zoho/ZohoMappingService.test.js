import { beforeEach, describe, expect, it, vi } from "vitest";
import ZohoMapping from "../../models/ZohoMapping.js";
import { acquireLease } from "./ZohoLease.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { syncMapped, findExact } from "./ZohoMappingService.js";

vi.mock("../../models/ZohoMapping.js", () => ({ default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ZohoLease.js", () => ({ default: { exists: vi.fn().mockResolvedValue(true), updateOne: vi.fn() } }));
vi.mock("./ZohoLease.js", () => ({ acquireLease: vi.fn(), releaseLease: vi.fn().mockResolvedValue({}) }));
vi.mock("./ZohoBooksClient.js", async original => ({ ...await original(), booksClient: vi.fn() }));
const options = () => ({ connection: { organization_id: "123" }, kind: "item", identity: "SKU-1", path: "items", singular: "item", payload: { sku: "SKU-1" }, lookup: vi.fn().mockResolvedValue(null) });

beforeEach(() => {
  vi.clearAllMocks();
  acquireLease.mockResolvedValue({ key: "test", owner: "worker" });
  ZohoMapping.findOneAndUpdate.mockResolvedValue({ state: "new" });
  ZohoMapping.updateOne.mockResolvedValue({ modifiedCount: 1 });
  booksClient.mockResolvedValue({ item: { item_id: "1234" } });
});

describe("durable Zoho mapping claims", () => {
  it("never creates when another worker owns the mapping", async () => {
    acquireLease.mockResolvedValue(null);
    await expect(syncMapped(options())).rejects.toThrow("ZOHO_MAPPING_BUSY");
    expect(booksClient).not.toHaveBeenCalled();
  });
  it("updates a mapped item instead of creating", async () => {
    ZohoMapping.findOneAndUpdate.mockResolvedValue({ state: "mapped", remote_id: "1234" });
    await syncMapped(options());
    expect(booksClient).toHaveBeenCalledWith(expect.anything(), "PUT", "items/1234", expect.anything());
  });
  it("persists a create intent before contacting Zoho", async () => {
    await syncMapped(options());
    expect(ZohoMapping.updateOne.mock.invocationCallOrder[0]).toBeLessThan(booksClient.mock.invocationCallOrder[0]);
    expect(ZohoMapping.updateOne).toHaveBeenNthCalledWith(1, expect.objectContaining({ state: "new" }), { $set: { state: "creating" } });
  });
  it("refuses a new POST after a lost acknowledgement", async () => {
    ZohoMapping.findOneAndUpdate.mockResolvedValue({ state: "creating" });
    ZohoMapping.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(syncMapped(options())).rejects.toThrow("AMBIGUOUS_CREATE_REVIEW_REQUIRED");
    expect(booksClient).not.toHaveBeenCalled();
  });
  it("retains create intent on ambiguous failure", async () => {
    booksClient.mockRejectedValue(new ZohoError("TIMEOUT", { ambiguous: true }));
    await expect(syncMapped(options())).rejects.toThrow("TIMEOUT");
    expect(ZohoMapping.updateOne).toHaveBeenCalledTimes(1);
  });
  it("allows retries after definite provider rejection", async () => {
    booksClient.mockRejectedValue(new ZohoError("RATE_LIMIT", { retryable: true }));
    await expect(syncMapped(options())).rejects.toThrow("RATE_LIMIT");
    expect(ZohoMapping.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({ state: "creating" }), { $set: { state: "new" } });
  });
  it("searches all pages before deciding no match exists", async () => {
    booksClient.mockResolvedValueOnce({ items: [], page_context: { has_more_page: true } })
      .mockResolvedValueOnce({ items: [{ item_id: "1234", sku: "SKU-1" }], page_context: { has_more_page: false } });
    const match = await findExact({ organization_id: "123" }, "items", { sku: "SKU-1" }, item => item.sku === "SKU-1");
    expect(match.item_id).toBe("1234");
    expect(booksClient).toHaveBeenCalledTimes(2);
  });
  it("refuses ambiguous existing matches", async () => {
    booksClient.mockResolvedValue({ items: [{ sku: "SKU-1" }, { sku: "SKU-1" }] });
    await expect(findExact({}, "items", {}, () => true)).rejects.toThrow("MULTIPLE_REMOTE_MATCHES");
  });
});
