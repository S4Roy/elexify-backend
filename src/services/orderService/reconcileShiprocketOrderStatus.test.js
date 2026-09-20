import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Package.js", () => ({
  default: { findOne: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("./packages/recomputeOrderStatus.js", () => ({
  recomputeOrderStatus: vi.fn().mockResolvedValue({ order: {}, statusChanged: false }),
}));
vi.mock("./manualOrderStatus.js", async () => {
  const actual = await vi.importActual("./manualOrderStatus.js");
  return { ...actual, applyManualOrderStatusChange: vi.fn() };
});

const { reconcileShiprocketOrderStatus } = await import("./reconcileShiprocketOrderStatus.js");
const { default: Package } = await import("../../models/Package.js");
const { default: Order } = await import("../../models/Order.js");
const { recomputeOrderStatus } = await import("./packages/recomputeOrderStatus.js");
const { applyManualOrderStatusChange } = await import("./manualOrderStatus.js");

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, logs: [] };

beforeEach(() => {
  vi.clearAllMocks();
  Package.findOne.mockResolvedValue(null);
  Order.findOne.mockResolvedValue(null);
});

describe("reconcileShiprocketOrderStatus", () => {
  it("skips rows with a missing order id or status", async () => {
    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "", Status: "DELIVERED" }, { "Order ID": "123", Status: "" }],
      logger: silentLogger,
    });
    expect(report.counters.skipped_missing_fields).toBe(2);
    expect(Package.findOne).not.toHaveBeenCalled();
  });

  it("skips a status it doesn't understand, without touching the DB", async () => {
    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "123", Status: "RTO DELIVERED" }],
      logger: silentLogger,
    });
    expect(report.counters.unsupported_status).toBe(1);
    expect(Package.findOne).not.toHaveBeenCalled();
  });

  it("matches a package by reference_id (\"<Order.id>-P<n>\", what the export's Order ID column actually contains) and advances it forward, only when --apply is passed", async () => {
    const pkg = { _id: "pkg1", order_id: "order1", status: "shipped" };
    Package.findOne.mockResolvedValue(pkg);

    const dryRun = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "ORD-000999-P1", Status: "DELIVERED" }],
      apply: false,
      logger: silentLogger,
    });
    expect(Package.findOne).toHaveBeenCalledWith({ reference_id: "ORD-000999-P1" });
    expect(dryRun.counters.package_matched_updated).toBe(1);
    expect(Package.updateOne).not.toHaveBeenCalled();

    const applied = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "ORD-000999-P1", Status: "DELIVERED" }],
      apply: true,
      logger: silentLogger,
    });
    expect(applied.counters.package_matched_updated).toBe(1);
    expect(Package.updateOne).toHaveBeenCalledWith(
      { _id: "pkg1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "delivered" }) }),
    );
    expect(recomputeOrderStatus).toHaveBeenCalledWith({ orderId: "order1", source: "reconciliation" });
  });

  it("falls back to Package.shiprocket_order_id only when reference_id doesn't match", async () => {
    const pkg = { _id: "pkg1", order_id: "order1", status: "shipped" };
    Package.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(pkg);

    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "998877", Status: "DELIVERED" }],
      apply: false,
      logger: silentLogger,
    });

    expect(Package.findOne).toHaveBeenNthCalledWith(1, { reference_id: "998877" });
    expect(Package.findOne).toHaveBeenNthCalledWith(2, { shiprocket_order_id: "998877" });
    expect(report.counters.package_matched_updated).toBe(1);
  });

  it("treats a package already at or past the reported status as a no-op", async () => {
    Package.findOne.mockResolvedValue({ _id: "pkg1", order_id: "order1", status: "delivered" });
    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "999", Status: "SHIPPED" }],
      apply: true,
      logger: silentLogger,
    });
    expect(report.counters.package_matched_noop).toBe(1);
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("matches a legacy (pre-Package-model) order by its own Order.id — no \"-P<n>\" suffix in the export for those — and calls the shared manual-status service", async () => {
    const order = { id: "ORD-000065", order_status: "processing", _id: "order65" };
    Order.findOne.mockResolvedValue(order);
    applyManualOrderStatusChange.mockResolvedValue({ ...order, order_status: "delivered" });

    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "ORD-000065", Status: "DELIVERED", Channel: "Elexify Web" }],
      apply: true,
      logger: silentLogger,
    });

    expect(Order.findOne).toHaveBeenCalledWith({ id: "ORD-000065", deleted_at: null });
    expect(applyManualOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ order, status: "delivered", changedBy: null }),
    );
    expect(report.counters.order_matched_updated).toBe(1);
  });

  it("falls back to the legacy Order.shiprocket_order_id field only when Order.id doesn't match", async () => {
    const order = { id: "ORD-000066", order_status: "processing", _id: "order66" };
    Order.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(order);
    applyManualOrderStatusChange.mockResolvedValue({ ...order, order_status: "delivered" });

    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "4271", Status: "DELIVERED", Channel: "WOOCOMMERCE" }],
      apply: true,
      logger: silentLogger,
    });

    expect(Order.findOne).toHaveBeenNthCalledWith(1, { id: "4271", deleted_at: null });
    expect(Order.findOne).toHaveBeenNthCalledWith(2, { shiprocket_order_id: "4271", deleted_at: null });
    expect(report.counters.order_matched_updated).toBe(1);
  });

  it("never regresses a legacy order that's already further along than the export row", async () => {
    Order.findOne.mockResolvedValue({ id: "ORD-1", order_status: "delivered", _id: "o1" });
    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "4271", Status: "SHIPPED" }],
      apply: true,
      logger: silentLogger,
    });
    expect(report.counters.order_matched_noop).toBe(1);
    expect(applyManualOrderStatusChange).not.toHaveBeenCalled();
  });

  it("counts a legacy order the shared service rejects (e.g. cancelled) as blocked, not a thrown error", async () => {
    const order = { id: "ORD-2", order_status: "cancelled", _id: "o2" };
    Order.findOne.mockResolvedValue(order);
    applyManualOrderStatusChange.mockRejectedValue(new Error("This order has cancellation, return, or refund effects and cannot be changed manually"));

    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "4272", Status: "DELIVERED" }],
      apply: true,
      logger: silentLogger,
    });
    expect(report.counters.order_matched_blocked).toBe(1);
    expect(report.blocked).toEqual([
      { shiprocket_order_id: "4272", order_id: "ORD-2", reason: expect.stringContaining("cancellation") },
    ]);
  });

  it("reports a row with no local Package or Order match as unmatched, never guessing", async () => {
    const report = await reconcileShiprocketOrderStatus({
      rows: [{ "Order ID": "99999999", Status: "DELIVERED", Channel: "WOOCOMMERCE" }],
      logger: silentLogger,
    });
    expect(report.counters.unmatched).toBe(1);
    expect(report.unmatched).toEqual([{ shiprocket_order_id: "99999999", status: "DELIVERED", channel: "WOOCOMMERCE" }]);
  });
});
