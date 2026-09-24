import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../models/OrderScans.js", () => ({ default: { bulkWrite: vi.fn() } }));
const { default: OrderScans } = await import("../../../models/OrderScans.js");
const { normalizeScan, recordScans } = await import("./recordScans.js");

describe("normalizeScan", () => {
  it("reads webhook scans and treats offset-less dates as IST", () => {
    const scan = normalizeScan({ date: "2026-09-24 14:30:00", activity: "SHIPMENT ARRIVED AT HUB", location: "KOLKATA HUB" });
    expect(scan.activity).toBe("SHIPMENT ARRIVED AT HUB");
    expect(scan.location).toBe("KOLKATA HUB");
    expect(scan.date.toISOString()).toBe("2026-09-24T09:00:00.000Z");
  });

  it("reads tracking-API activities including the Shiprocket status label", () => {
    const scan = normalizeScan({ date: "2026-09-24 10:00:00", status: "X-UCI", activity: "In Transit", location: "Delhi", "sr-status-label": "IN TRANSIT" });
    expect(scan).toMatchObject({ activity: "In Transit", status_label: "IN TRANSIT" });
  });

  it("drops scans without any activity text", () => {
    expect(normalizeScan({ date: "2026-09-24 10:00:00", location: "Delhi" })).toBeNull();
  });
});

describe("recordScans", () => {
  beforeEach(() => OrderScans.bulkWrite.mockReset());

  it("upserts each scan keyed on order, AWB, date and activity", async () => {
    OrderScans.bulkWrite.mockResolvedValue({ upsertedCount: 2 });
    const inserted = await recordScans({
      orderId: "o1",
      packageId: "p1",
      awb: 123,
      scans: [
        { date: "2026-09-24 10:00:00", activity: "Picked up", location: "A" },
        { date: "2026-09-24 12:00:00", activity: "In transit", location: "B" },
        { location: "no activity" },
      ],
      source: "tracking_api",
    });
    expect(inserted).toBe(2);
    const ops = OrderScans.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toMatchObject({ order_id: "o1", awb: "123", activity: "Picked up" });
    expect(ops[0].updateOne.update.$setOnInsert).toMatchObject({ package_id: "p1", location: "A", source: "tracking_api" });
    expect(ops[0].updateOne.upsert).toBe(true);
  });

  it("treats a duplicate-key race as already recorded", async () => {
    // A plain function (not vi.fn): the spy's own promise tracking would
    // surface the intentional rejection as unhandled.
    const original = OrderScans.bulkWrite;
    OrderScans.bulkWrite = async () => {
      const error = new Error("E11000 duplicate key");
      error.code = 11000;
      throw error;
    };
    try {
      await expect(recordScans({ orderId: "o1", awb: "1", scans: [{ activity: "x" }] })).resolves.toBe(0);
    } finally {
      OrderScans.bulkWrite = original;
    }
  });

  it("does nothing without an order or scans", async () => {
    expect(await recordScans({ orderId: null, scans: [{ activity: "x" }] })).toBe(0);
    expect(await recordScans({ orderId: "o1", scans: [] })).toBe(0);
    expect(OrderScans.bulkWrite).not.toHaveBeenCalled();
  });
});
