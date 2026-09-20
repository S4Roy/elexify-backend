import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/Package.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./liveShiprocketImport.js", () => ({ findRemoteReference: vi.fn() }));
vi.mock("./packages/registerExternalPackage.js", () => ({ registerExternalPackage: vi.fn() }));
vi.mock("../shiprocket/returnShipment.js", () => ({ returnApi: vi.fn() }));

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

  it("already linked (legacy field): looks it up and writes nothing, for any order status", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "cancelled", shiprocket_order_id: "999" });
    Package.find.mockResolvedValue([]);
    returnApi.mockResolvedValue({ data: { id: 999, channel_order_id: "ORD-1", shipments: [{ current_status: "Delivered", awb: "AWB1", courier_name: "BlueDart" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(result).toEqual({
      found: true, linked_now: false,
      details: { shiprocket_order_id: "999", channel_order_id: "ORD-1", channel_name: null, status: "Delivered", shipment_id: null, awb: "AWB1", courier_name: "BlueDart", etd: null },
    });
    expect(Order.updateOne).not.toHaveBeenCalled();
    expect(Package.updateOne).not.toHaveBeenCalled();
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });

  it("already linked via a package: looks it up without writing", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([{ shiprocket_order_id: "555" }]);
    returnApi.mockResolvedValue({ data: { id: 555, channel_order_id: "ORD-1-P1", shipments: { current_status: "Shipped", awb: "AWB2" } } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(returnApi).toHaveBeenCalledWith("GET", "orders/show/555");
    expect(result.linked_now).toBe(false);
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });

  it("rejects when the order has packages but none of them are linked, without guessing", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([{ shiprocket_order_id: null }]);

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(result).toEqual({ found: false, message: expect.stringContaining("aren't linked") });
    expect(findRemoteReference).not.toHaveBeenCalled();
  });

  it("not linked anywhere: a confirmed-delivered match gets written via the historical-delivery path", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "processing", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    registerExternalPackage.mockResolvedValue({ pkg: {}, order: { order_status: "delivered" } });
    returnApi.mockResolvedValue({ data: { id: 777, channel_order_id: "ORD-1", shipments: [{ current_status: "Delivered" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(findRemoteReference).toHaveBeenCalledWith("ORD-1");
    expect(registerExternalPackage).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", shiprocketOrderId: 777, adminId: "admin1", legacyDeliveredImport: true }),
    );
    expect(result.found).toBe(true);
    expect(result.linked_now).toBe(true);
    expect(result.details.shiprocket_order_id).toBe("777");
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
