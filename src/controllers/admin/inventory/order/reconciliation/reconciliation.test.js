vi.mock("../../../../../services/orderService/forceOrderStatusImport.js", () => ({ auditForceOrderStatusImport: vi.fn(), applyForceOrderStatusRow: vi.fn() }));
vi.mock("../../../../../services/orderService/liveShiprocketImport.js", () => ({ auditLiveShiprocketImport: vi.fn(), applyLiveShiprocketRow: vi.fn() }));
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../models/ShiprocketReconciliationAudit.js", () => ({
  default: { create: vi.fn(), findById: vi.fn(), find: vi.fn(), findOneAndUpdate: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock("../../../../../services/index.js", () => ({
  orderService: { parseCsvBuffer: vi.fn(), reconcileShiprocketOrderStatus: vi.fn() },
}));

const { audit } = await import("./audit.js");
const { apply } = await import("./apply.js");
const { list } = await import("./list.js");
const { default: ShiprocketReconciliationAudit } = await import("../../../../../models/ShiprocketReconciliationAudit.js");
const { orderService } = await import("../../../../../services/index.js");

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliation audit endpoint", () => {
  it("rejects when no file is uploaded", async () => {
    const req = { files: null, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await audit(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("CSV file is required") }));
    expect(orderService.parseCsvBuffer).not.toHaveBeenCalled();
  });

  it("rejects a non-.csv file", async () => {
    const req = { files: { file: { name: "orders.pdf", data: Buffer.from("") } }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await audit(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(".csv file") }));
  });

  it("parses the CSV, runs a dry run, and persists an audit doc", async () => {
    const rows = [{ "Order ID": "1", Status: "DELIVERED" }];
    orderService.parseCsvBuffer.mockResolvedValue(rows);
    const report = { apply: false, counters: { total_rows: 1 }, applied: [], blocked: [], unmatched: [] };
    orderService.reconcileShiprocketOrderStatus.mockResolvedValue(report);
    ShiprocketReconciliationAudit.create.mockResolvedValue({ _id: "audit1" });

    const req = { files: { file: { name: "export.csv", data: Buffer.from("Order ID,Status\n1,DELIVERED") } }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await audit(req, res, next);

    expect(orderService.reconcileShiprocketOrderStatus).toHaveBeenCalledWith({ rows, apply: false });
    expect(ShiprocketReconciliationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "export.csv", rows, dry_run_report: report, uploaded_by: "admin1" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an empty CSV", async () => {
    orderService.parseCsvBuffer.mockResolvedValue([]);
    const req = { files: { file: { name: "export.csv", data: Buffer.from("") } }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await audit(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("no rows") }));
    expect(ShiprocketReconciliationAudit.create).not.toHaveBeenCalled();
  });
});

describe("reconciliation apply endpoint", () => {
  it("404s when the audit doesn't exist or expired", async () => {
    ShiprocketReconciliationAudit.findById.mockResolvedValue(null);
    const req = { body: { audit_id: "missing" }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await apply(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("expired") }));
  });

  it("refuses to re-apply an audit that's already been applied", async () => {
    ShiprocketReconciliationAudit.findById.mockResolvedValue({
      status: "applied", applied_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    const req = { body: { audit_id: "audit1" }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await apply(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("already applied") }));
    expect(orderService.reconcileShiprocketOrderStatus).not.toHaveBeenCalled();
  });

  it("runs the real apply pass over the stored rows and marks the audit applied", async () => {
    const rows = [{ "Order ID": "1", Status: "DELIVERED" }];
    const auditDoc = { _id: "audit1", status: "audited", rows, save: vi.fn().mockResolvedValue(undefined) };
    ShiprocketReconciliationAudit.findById.mockResolvedValue(auditDoc);
    const report = { apply: true, counters: { total_rows: 1 }, applied: [], blocked: [], unmatched: [] };
    orderService.reconcileShiprocketOrderStatus.mockResolvedValue(report);

    const req = { body: { audit_id: "audit1", confirmation: "APPLY RECONCILIATION" }, auth: { user_id: "admin1" } };
    const res = mockRes();
    const next = vi.fn();
    await apply(req, res, next);

    expect(orderService.reconcileShiprocketOrderStatus).toHaveBeenCalledWith({ rows, apply: true });
    expect(auditDoc.status).toBe("applied");
    expect(auditDoc.apply_report).toBe(report);
    expect(auditDoc.applied_by).toBe("admin1");
    expect(auditDoc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("reconciliation list endpoint", () => {
  it("returns recent audits without the raw rows", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: "audit1", filename: "export.csv", status: "applied" }]),
    };
    ShiprocketReconciliationAudit.find.mockReturnValue(query);

    const req = {};
    const res = mockRes();
    const next = vi.fn();
    await list(req, res, next);

    expect(query.select).toHaveBeenCalledWith("-rows -candidates");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { audits: [{ _id: "audit1", filename: "export.csv", status: "applied" }] },
    }));
  });
});


describe("live import apply batches", () => {
  it("rejects a concurrent claim without syncing", async () => {
    const { applyLiveShiprocketRow } = await import("../../../../../services/orderService/liveShiprocketImport.js");
    ShiprocketReconciliationAudit.findById.mockResolvedValue({ _id: "audit1", mode: "live_delivered", status: "audited", cursor: 0 });
    ShiprocketReconciliationAudit.findOneAndUpdate.mockResolvedValue(null);
    const next = vi.fn();
    await apply({ body: { audit_id: "audit1" }, auth: { user_id: "admin1" } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("already processing") }));
    expect(applyLiveShiprocketRow).not.toHaveBeenCalled();
  });
  it("persists a blocked row and advances the resumable cursor", async () => {
    const { applyLiveShiprocketRow } = await import("../../../../../services/orderService/liveShiprocketImport.js");
    const doc = { _id: "audit1", mode: "live_delivered", status: "audited", cursor: 0, candidates: [{ reference: "4271" }] };
    ShiprocketReconciliationAudit.findById.mockResolvedValue(doc);
    ShiprocketReconciliationAudit.findOneAndUpdate.mockResolvedValue(doc);
    ShiprocketReconciliationAudit.findByIdAndUpdate.mockResolvedValue({ ...doc, cursor: 1 });
    applyLiveShiprocketRow.mockRejectedValue(Error("Live status changed"));
    const res = mockRes();
    await apply({ body: { audit_id: "audit1" }, auth: { user_id: "admin1" } }, res, vi.fn());
    expect(ShiprocketReconciliationAudit.findByIdAndUpdate).toHaveBeenCalledWith("audit1", expect.objectContaining({
      $set: expect.objectContaining({ cursor: 1, processing: false, status: "applied", applied_by: "admin1" }),
      $push: { outcomes: { reference: "4271", status: "blocked", reason: "Live status changed" } },
    }), { new: true });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true, cursor: 1 }) }));
  });
});


it("applies a stored force-mode candidate without calling Shiprocket", async () => {
  const { applyForceOrderStatusRow } = await import("../../../../../services/orderService/forceOrderStatusImport.js");
  const { applyLiveShiprocketRow } = await import("../../../../../services/orderService/liveShiprocketImport.js");
  const candidate = { reference: "4271", status: "delivered", expectedStatus: "pending" };
  const doc = { _id: "audit1", mode: "force_status", status: "audited", filename: "orders.xlsx", cursor: 0, candidates: [candidate] };
  ShiprocketReconciliationAudit.findById.mockResolvedValue(doc);
  ShiprocketReconciliationAudit.findOneAndUpdate.mockResolvedValue(doc);
  ShiprocketReconciliationAudit.findByIdAndUpdate.mockResolvedValue({ ...doc, cursor: 1 });
  const next = vi.fn();
  const res = mockRes();
  await apply({ body: { audit_id: "audit1" }, auth: { user_id: "admin1" } }, res, next);
  expect(applyForceOrderStatusRow).toHaveBeenCalledWith(candidate, "admin1", "orders.xlsx");
  expect(applyLiveShiprocketRow).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true }) }));
});
