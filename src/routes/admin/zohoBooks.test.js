import { ROLE_PERMISSIONS } from "../../constants/adminPermissions.js";
import ZohoIntegrationLog from "../../models/ZohoIntegrationLog.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import ZohoMapping from "../../models/ZohoMapping.js";
import ZohoSyncJob from "../../models/ZohoSyncJob.js";
import express from "express";
import request from "supertest";
import { errors } from "celebrate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zohoBooksRouter } from "./zohoBooks.js";
import ZohoConnection from "../../models/ZohoConnection.js";
import { completeAuthorization } from "../../services/zoho/ZohoAuthService.js";
import { enqueueSync } from "../../services/zoho/ZohoSyncQueue.js";

vi.mock("../../services/zoho/ZohoAuthService.js", () => ({ beginAuthorization: vi.fn(), completeAuthorization: vi.fn(), disconnect: vi.fn() }));
vi.mock("../../services/zoho/ZohoSyncQueue.js", () => ({ enqueueSync: vi.fn() }));
vi.mock("../../models/ZohoConnection.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/ZohoIntegrationLog.js", () => ({ default: { create: vi.fn().mockResolvedValue({}), find: vi.fn(), countDocuments: vi.fn() } }));

const app = role => {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => { req.authorization = { permissions: new Set(ROLE_PERMISSIONS[role] || []) }; req.auth = { role, user_id: "507f1f77bcf86cd799439011" }; next(); });
  server.use(zohoBooksRouter);
  server.use(errors());
  server.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  return server;
};

beforeEach(() => {
  vi.clearAllMocks();
  ZohoConnection.findOne.mockResolvedValue({ connected: true, enabled: true, organization_id: "123" });
  enqueueSync.mockResolvedValue({ status: "queued" });
});

describe("Zoho Books admin boundary", () => {
  it("returns log totals for pagination while preserving the legacy array response", async () => {
    const logs = [{ event: "synced", entity_id: "record" }];
    const query = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(logs) };
    ZohoIntegrationLog.find.mockReturnValue(query);
    ZohoIntegrationLog.countDocuments.mockResolvedValue(73);
    const response = await request(app("manager")).get("/logs?page=2&paginated=true");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ logs, total: 73 });
    expect(query.skip).toHaveBeenCalledWith(50);
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(ZohoIntegrationLog.countDocuments).toHaveBeenCalledWith(ZohoIntegrationLog.find.mock.calls[0][0]);
    ZohoIntegrationLog.countDocuments.mockClear();
    const legacy = await request(app("manager")).get("/logs");
    expect(legacy.status).toBe(200);
    expect(legacy.body.data).toEqual(logs);
    expect(ZohoIntegrationLog.countDocuments).not.toHaveBeenCalled();
  });
  it("denies non-authorized roles", async () => {
    expect((await request(app("staff")).get("/")).status).toBe(403);
    expect((await request(app("customer")).post("/sync").send({})).status).toBe(403);
  });
  it("does not let managers modify OAuth configuration", async () => {
    expect((await request(app("manager")).post("/connect").send({ region: "in" })).status).toBe(403);
  });
  it("rejects malformed and unbounded sync requests", async () => {
    const response = await request(app("manager")).post("/sync").send({ kind: "item", ids: ["invalid"] });
    expect(response.status).toBe(400);
    expect(enqueueSync).not.toHaveBeenCalled();
  });
  it("enqueues an authorized manual sync instead of calling Zoho inline", async () => {
    const response = await request(app("manager")).post("/sync").send({ kind: "item", ids: ["507f1f77bcf86cd799439012"] });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ status: "queued" }]);
    expect(enqueueSync).toHaveBeenCalledWith(expect.anything(), "item", "507f1f77bcf86cd799439012", { retry: true });
  });
  it("binds the OAuth callback to the authenticated administrator", async () => {
    const response = await request(app("superadmin")).post("/callback").send({ state: "a".repeat(64), code: "code" });
    expect(response.status).toBe(200);
    expect(completeAuthorization).toHaveBeenCalledWith("507f1f77bcf86cd799439011", "a".repeat(64), "code");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/User.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../models/ZohoMapping.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/ZohoSyncJob.js", () => ({ default: { findOne: vi.fn() } }));

describe("order customer sync controls", () => {
  const id = "507f1f77bcf86cd799439012";
  beforeEach(() => {
    Order.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ id: "ORD-1", user: null }) }) });
    ZohoMapping.findOne.mockReturnValue({ lean: async () => ({ remote_id: "contact-123" }) });
    ZohoSyncJob.findOne.mockReturnValue({ lean: async () => null });
  });
  it("queues manual customer sync for an order", async () => {
    const response = await request(app("manager")).post("/sync").send({ kind: "order_contact", ids: [id] });
    expect(response.status).toBe(200);
    expect(enqueueSync).toHaveBeenCalledWith(expect.anything(), "order_contact", id, { retry: true });
  });
  it("returns the guest customer reference scoped to the selected organization", async () => {
    const response = await request(app("manager")).get(`/orders/${id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.customer.contact_id).toBe("contact-123");
    expect(ZohoMapping.findOne).toHaveBeenCalledWith({ organization_id: "123", kind: "contact", identity: "order-ORD-1", state: "mapped" });
  });
  it("uses an existing same-organization customer link", async () => {
    Order.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ id: "ORD-1", user: id }) }) });
    User.findById.mockReturnValue({ select: () => ({ lean: async () => ({ zoho_organization_id: "123", zoho_contact_id: "existing" }) }) });
    ZohoMapping.findOne.mockReturnValue({ lean: async () => null });
    const response = await request(app("manager")).get(`/orders/${id}`);
    expect(response.body.data.customer.contact_id).toBe("existing");
  });
  it("rejects unauthorized customer sync", async () => {
    expect((await request(app("customer")).post("/sync").send({ kind: "order_contact", ids: [id] })).status).toBe(403);
    expect(enqueueSync).not.toHaveBeenCalled();
  });
});
