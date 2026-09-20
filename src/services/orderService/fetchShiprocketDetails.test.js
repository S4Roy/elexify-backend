import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/Package.js", () => ({ default: { find: vi.fn() } }));
vi.mock("./liveShiprocketImport.js", () => ({ findRemoteReference: vi.fn() }));
vi.mock("./packages/registerExternalPackage.js", () => ({ registerExternalPackage: vi.fn() }));
vi.mock("./packages/syncShiprocketStatus.js", () => ({ syncShiprocketStatus: vi.fn() }));

const { fetchShiprocketDetailsForOrder } = await import("./fetchShiprocketDetails.js");
const { default: Order } = await import("../../models/Order.js");
const { default: Package } = await import("../../models/Package.js");
const { findRemoteReference } = await import("./liveShiprocketImport.js");
const { registerExternalPackage } = await import("./packages/registerExternalPackage.js");
const { syncShiprocketStatus } = await import("./packages/syncShiprocketStatus.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchShiprocketDetailsForOrder", () => {
  it("404s when the order doesn't exist", async () => {
    Order.findOne.mockResolvedValue(null);
    await expect(fetchShiprocketDetailsForOrder({ orderId: "missing", adminId: "admin1" })).rejects.toThrow("Order not found");
  });

  it("resyncs via the existing link when the order already has one (legacy field)", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: "999" });
    Package.find.mockResolvedValue([]);
    syncShiprocketStatus.mockResolvedValue({ order: { order_status: "delivered" }, changed: true, results: [] });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(syncShiprocketStatus).toHaveBeenCalledWith({ orderId: "o1", adminId: "admin1" });
    expect(findRemoteReference).not.toHaveBeenCalled();
    expect(result.order.order_status).toBe("delivered");
  });

  it("resyncs via the existing link when a package already carries one", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([{ shiprocket_order_id: "555" }]);
    syncShiprocketStatus.mockResolvedValue({ order: { order_status: "shipped" }, changed: true, results: [] });

    await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });
    expect(syncShiprocketStatus).toHaveBeenCalled();
  });

  it("rejects when the order has packages but none of them are linked, without guessing", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([{ shiprocket_order_id: null }]);

    await expect(fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" })).rejects.toThrow(/aren't linked/);
    expect(findRemoteReference).not.toHaveBeenCalled();
  });

  it("searches Shiprocket live by the order's own id and links it on a single match", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 777, channel_order_id: "ORD-1" }]);
    registerExternalPackage.mockResolvedValue({ pkg: {}, order: { order_status: "packed" } });

    const result = await fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" });

    expect(findRemoteReference).toHaveBeenCalledWith("ORD-1");
    expect(registerExternalPackage).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o1", shiprocketOrderId: 777, adminId: "admin1" }),
    );
    expect(result).toEqual({ order: { order_status: "packed" }, changed: true, results: [] });
  });

  it("reports not found rather than guessing when nothing matches", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([]);

    await expect(fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" })).rejects.toThrow(/No Shiprocket order was found/);
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });

  it("refuses to guess when multiple Shiprocket orders share the same reference", async () => {
    Order.findOne.mockResolvedValue({ _id: "o1", id: "ORD-1", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    findRemoteReference.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await expect(fetchShiprocketDetailsForOrder({ orderId: "o1", adminId: "admin1" })).rejects.toThrow(/Multiple Shiprocket orders/);
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });
});
