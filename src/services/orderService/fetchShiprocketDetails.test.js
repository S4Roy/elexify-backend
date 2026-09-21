import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/Package.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./liveShiprocketImport.js", () => ({ findRemoteReference: vi.fn() }));
vi.mock("./packages/registerExternalPackage.js", () => ({ registerExternalPackage: vi.fn() }));
vi.mock("../shiprocket/returnShipment.js", () => ({ returnApi: vi.fn() }));

vi.mock("./packages/syncShiprocketStatus.js", () => ({ syncShiprocketStatus: vi.fn() }));
const { syncShiprocketStatus } = await import("./packages/syncShiprocketStatus.js");
const { fetchShiprocketDetailsForOrder } = await import("./fetchShiprocketDetails.js");
const { default: Order } = await import("../../models/Order.js");
const { default: Package } = await import("../../models/Package.js");
const { findRemoteReference } = await import("./liveShiprocketImport.js");
const { registerExternalPackage } = await import("./packages/registerExternalPackage.js");
const { returnApi } = await import("../shiprocket/returnShipment.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchShiprocketDetailsForOrder", () => {
  it("404s when the order doesn't exist", async () => {
    Order.findOne.mockResolvedValue(null);
    await expect(fetchShiprocketDetailsForOrder({ orderId: "missing", adminId: "admin1" })).rejects.toThrow("Order not found");
  });

  it("syncs all packages even when the parent has a legacy link", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", shiprocket_order_id: "legacy" });
    Package.find.mockResolvedValue([{ _id: "p1", shiprocket_order_id: "555" }, { _id: "p2", shiprocket_order_id: "556" }]);
    syncShiprocketStatus.mockResolvedValue({ order: { order_status: "partially_delivered" }, changed: true,
      results: [{ package_id: "p1", details: { awb: "AWB1" } }, { package_id: "p2", outcome: "error" }] });
    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(syncShiprocketStatus).toHaveBeenCalledWith({ orderId: "o1", adminId: "admin1", packageIds: null });
    expect(result.packages).toHaveLength(2);
    expect(result.changed).toBe(true);
    expect(findRemoteReference).not.toHaveBeenCalled();
  });
  it("returns unlinked packages without guessing or searching the parent reference", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1" });
    Package.find.mockResolvedValue([{ _id: "p1" }]);
    syncShiprocketStatus.mockResolvedValue({ order: {}, changed: false, results: [{ package_id: "p1", outcome: "unlinked" }] });
    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(result.found).toBe(false);
    expect(result.packages[0].outcome).toBe("unlinked");
    expect(findRemoteReference).not.toHaveBeenCalled();
  });

  it("not linked anywhere: a confirmed-delivered match gets written via the historical-delivery path", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "processing", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    registerExternalPackage.mockResolvedValue({ pkg: {}, order: { order_status: "delivered" } });
    returnApi.mockResolvedValue({ data: { id: 777, channel_order_id: "ORD-1", shipments: [{ current_status: "Delivered" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(findRemoteReference).toHaveBeenCalledWith("ORD-1", {});
    expect(registerExternalPackage).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", shiprocketOrderId: 777, adminId: "admin1", legacyDeliveredImport: true }),
    );
    expect(result.found).toBe(true);
    expect(result.linked_now).toBe(true);
    expect(result.details.shiprocket_order_id).toBe("777");
  });

  it("scopes the live search to the given channel", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "processing", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    returnApi.mockResolvedValue({ data: { id: 777, channel_order_id: "ORD-1", shipments: [{ current_status: "Packed" }] } });

    await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1", channelId: "12345" });

    expect(findRemoteReference).toHaveBeenCalledWith("ORD-1", { channel_id: "12345" });
  });

  it("not linked anywhere: a match that isn't delivered yet is only shown, never written — the legacy bare-id reference can't pass ordinary verification", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "processing", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    returnApi.mockResolvedValue({ data: { id: 777, channel_order_id: "ORD-1", shipments: [{ current_status: "Packed" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(registerExternalPackage).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: true, linked_now: false,
      details: { shiprocket_order_id: "777", channel_order_id: "ORD-1", channel_name: null, status: "Packed", shipment_id: null, awb: null, courier_name: null, etd: null },
    });
  });

  it("reports not-found rather than guessing when nothing matches, and writes nothing", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([]);

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(result).toEqual({ found: false, message: expect.stringContaining("No Shiprocket order was found") });
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });

  it("refuses to guess and writes nothing when multiple Shiprocket orders share the reference", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(result).toEqual({ found: false, message: expect.stringContaining("2 Shiprocket orders match") });
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });
});
