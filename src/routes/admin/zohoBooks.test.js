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
vi.mock("../../models/ZohoIntegrationLog.js", () => ({ default: { create: vi.fn().mockResolvedValue({}) } }));

const app = role => {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => { req.auth = { role, user_id: "507f1f77bcf86cd799439011" }; next(); });
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
