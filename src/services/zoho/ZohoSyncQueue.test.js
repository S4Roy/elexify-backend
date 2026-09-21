import { syncContact } from "./ZohoContactService.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ZohoConnection from "../../models/ZohoConnection.js";
import ZohoSyncJob from "../../models/ZohoSyncJob.js";
import Order from "../../models/Order.js";
import { processZohoQueue, enqueueSync, reconcileOrderContacts } from "./ZohoSyncQueue.js";
import { acquireLease } from "./ZohoLease.js";
import { syncItem } from "./ZohoItemService.js";
import { ZohoError } from "./ZohoBooksClient.js";

vi.mock("../../models/ZohoConnection.js", () => ({ default: { findOne: vi.fn(), exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ZohoSyncJob.js", () => ({ default: { findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/ZohoIntegrationLog.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../../models/ZohoLease.js", () => ({ default: { updateOne: vi.fn() } }));
vi.mock("../../models/Order.js", () => ({ default: { find: vi.fn(), findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./ZohoLease.js", () => ({ acquireLease: vi.fn(), releaseLease: vi.fn() }));
vi.mock("./ZohoSourceChanges.js", () => ({ reconcileSourceChanges: vi.fn() }));
vi.mock("./ZohoItemService.js", () => ({ syncItem: vi.fn() }));
vi.mock("./ZohoContactService.js", () => ({ syncContact: vi.fn() }));
vi.mock("./ZohoSalesOrderService.js", () => ({ syncSalesOrder: vi.fn(), assertOrderEligible: vi.fn() }));
const connection = { _id: "connection", organization_id: "123", enabled: true, connected: true, enabled_since: new Date(), generation: 1 };
const job = { _id: "job", kind: "item", entity_id: "entity", revision: 2, attempts: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  Order.findById.mockReturnValue({ lean: async () => ({ _id: "new-order" }) });
  ZohoConnection.findOne.mockResolvedValue(connection);
  ZohoConnection.exists.mockResolvedValue(true);
  acquireLease.mockResolvedValue({ key: "worker", owner: "one" });
  Order.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  ZohoSyncJob.findOneAndUpdate.mockResolvedValueOnce(job).mockResolvedValue(null);
  ZohoSyncJob.updateOne.mockResolvedValue({ matchedCount: 1 });
  ZohoSyncJob.findOne.mockReturnValue({ lean: async () => job });
  syncItem.mockResolvedValue("1234");
});

describe("Zoho durable queue", () => {
  it("does nothing while disabled", async () => {
    ZohoConnection.findOne.mockResolvedValue(null);
    await processZohoQueue();
    expect(acquireLease).not.toHaveBeenCalled();
  });
  it("does not run a second worker for the same organization", async () => {
    acquireLease.mockResolvedValue(null);
    await processZohoQueue();
    expect(syncItem).not.toHaveBeenCalled();
  });
  it("fences completion by job revision and owner", async () => {
    await processZohoQueue();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "job", revision: 2, lease_owner: expect.any(String) }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "synced" }) }));
  });
  it("retries transient failures without losing the job", async () => {
    syncItem.mockRejectedValue(new ZohoError("ZOHO_HTTP_429_CODE_45", { retryable: true, retryAfter: 120000 }));
    await processZohoQueue();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "retrying" }) }));
    expect(ZohoConnection.updateOne).toHaveBeenCalledWith({ _id: "connection" }, { $set: { paused_until: expect.any(Date) } });
  });
  it("sends ambiguous creates to review instead of replaying", async () => {
    syncItem.mockRejectedValue(new ZohoError("TIMEOUT", { ambiguous: true, retryable: true }));
    await processZohoQueue();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "review" }) }));
  });
  it("dead-letters exhausted retries", async () => {
    ZohoSyncJob.findOneAndUpdate.mockReset().mockResolvedValueOnce({ ...job, attempts: 8 }).mockResolvedValue(null);
    syncItem.mockRejectedValue(new ZohoError("UNAVAILABLE", { retryable: true }));
    await processZohoQueue();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "dead_letter" }) }));
  });
  it("deduplicates automatic events and only advances newer source revisions", async () => {
    await enqueueSync(connection, "item", "entity", { sourceVersion: 3 });
    expect(ZohoSyncJob.updateOne).toHaveBeenNthCalledWith(1,
      { organization_id: "123", kind: "item", entity_id: "entity" }, expect.objectContaining({ $setOnInsert: expect.any(Object) }), { upsert: true });
    expect(ZohoSyncJob.updateOne).toHaveBeenNthCalledWith(2, expect.objectContaining({ source_version: { $lt: 3 } }), expect.objectContaining({ $inc: { revision: 1 } }));
  });
});


describe("new order customer synchronization", () => {
  it("queues unpacked orders since activation and records durable enqueue", async () => {
    Order.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: "new-order" }] }) }) });
    await reconcileOrderContacts(connection);
    expect(Order.find).toHaveBeenCalledWith({ deleted_at: null, created_at: { $gte: connection.enabled_since },
      "zoho.contact_queued_organization_id": { $ne: "123" } });
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(
      { organization_id: "123", kind: "order_contact", entity_id: "new-order" },
      expect.objectContaining({ $setOnInsert: expect.any(Object) }), { upsert: true });
    expect(Order.updateOne).toHaveBeenCalledWith({ _id: "new-order" }, { $set: { "zoho.contact_queued_organization_id": "123" } });
  });
  it("leaves orders discoverable when enqueue fails", async () => {
    Order.find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: "new-order" }] }) }) });
    ZohoSyncJob.updateOne.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(reconcileOrderContacts(connection)).rejects.toThrow("Database unavailable");
    expect(Order.updateOne).not.toHaveBeenCalled();
  });
  it.each(["user1", null])("uses order address snapshots for customer %s", async user => {
    const order = { _id: "order1", id: "ORD-1", user, order_status: "confirmed", billing_address_snapshot: { full_name: "Customer" } };
    Order.findById.mockReturnValue({ lean: async () => order });
    ZohoSyncJob.findOneAndUpdate.mockReset().mockResolvedValueOnce({ ...job, kind: "order_contact", entity_id: "order1" }).mockResolvedValue(null);
    syncContact.mockResolvedValue("contact1");
    await processZohoQueue();
    expect(syncContact).toHaveBeenCalledWith(connection, user, order);
    expect(syncItem).not.toHaveBeenCalled();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "job" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "synced" }) }));
  });
  it("does not export deleted orders", async () => {
    Order.findById.mockReturnValue({ lean: async () => ({ deleted_at: new Date() }) });
    ZohoSyncJob.findOneAndUpdate.mockReset().mockResolvedValueOnce({ ...job, kind: "order_contact" }).mockResolvedValue(null);
    await processZohoQueue();
    expect(syncContact).not.toHaveBeenCalled();
    expect(ZohoSyncJob.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "job" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "dead_letter", last_error: "ORDER_NOT_FOUND" }) }));
  });
});
