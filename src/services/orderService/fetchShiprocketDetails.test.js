import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../models/Package.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("./liveShiprocketImport.js", () => ({ findRemoteReference: vi.fn() }));
vi.mock("../shiprocket/returnShipment.js", () => ({ returnApi: vi.fn() }));

const { fetchShiprocketDetailsForOrder } = await import("./fetchShiprocketDetails.js");
const { default: Order } = await import("../../models/Order.js");
const { default: Package } = await import("../../models/Package.js");
const { findRemoteReference } = await import("./liveShiprocketImport.js");
const { returnApi } = await import("../shiprocket/returnShipment.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchShiprocketDetailsForOrder", () => {
  it("404s when the order doesn't exist", async () => {
    Order.findOne.mockResolvedValue(null);
    await expect(fetchShiprocketDetailsForOrder({ orderId: "missing" })).rejects.toThrow("Order not found");
  });

  it("works for an order in any status — e.g. cancelled — since it's read-only", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", order_status: "cancelled", shiprocket_order_id: "999" });
    Package.find.mockResolvedValue([]);
    returnApi.mockResolvedValue({ data: { id: 999, channel_order_id: "ORD-1", shipments: [{ current_status: "Delivered", awb: "AWB1", courier_name: "BlueDart" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1" });

    expect(result).toEqual({
      found: true,
      details: { shiprocket_order_id: "999", channel_order_id: "ORD-1", channel_name: null, status: "Delivered", shipment_id: null, awb: "AWB1", courier_name: "BlueDart", etd: null },
    });
    expect(Order.updateOne).not.toHaveBeenCalled();
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("looks up an already-linked package without writing anything to the DB", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([{ shiprocket_order_id: "555" }]);
    returnApi.mockResolvedValue({ data: { id: 555, channel_order_id: "ORD-1-P1", shipments: { current_status: "Shipped", awb: "AWB2" } } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1" });

    expect(returnApi).toHaveBeenCalledWith("GET", "orders/show/555");
    expect(result.found).toBe(true);
    expect(result.details.status).toBe("Shipped");
    expect(Order.updateOne).not.toHaveBeenCalled();
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("searches Shiprocket live by the order's own id when nothing is linked, without linking it", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    returnApi.mockResolvedValue({ data: { id: 777, channel_order_id: "ORD-1", shipments: [{ current_status: "Packed" }] } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1" });

    expect(findRemoteReference).toHaveBeenCalledWith("ORD-1");
    expect(result.found).toBe(true);
    expect(result.details.shiprocket_order_id).toBe("777");
    expect(Order.updateOne).not.toHaveBeenCalled();
    expect(Package.updateOne).not.toHaveBeenCalled();
  });

  it("reports not-found rather than guessing when nothing matches", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([]);

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1" });
    expect(result).toEqual({ found: false, message: expect.stringContaining("No Shiprocket order was found") });
  });

  it("reports ambiguity rather than guessing when multiple orders share the reference", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1" });
    expect(result).toEqual({ found: false, message: expect.stringContaining("2 Shiprocket orders match") });
  });
});
