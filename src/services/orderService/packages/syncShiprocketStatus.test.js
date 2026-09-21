import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../../models/Package.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../shiprocket/returnShipment.js", () => ({ returnApi: vi.fn() }));
vi.mock("./recomputeOrderStatus.js", () => ({ recomputeOrderStatus: vi.fn() }));
vi.mock("../manualOrderStatus.js", async () => {
  const actual = await vi.importActual("../manualOrderStatus.js");
  return { ...actual, applyManualOrderStatusChange: vi.fn() };
});
vi.mock("../../index.js", () => ({
  notificationService: { sendOrderNotification: vi.fn() },
}));

const { syncShiprocketStatus } = await import("./syncShiprocketStatus.js");
const { default: Order } = await import("../../../models/Order.js");
const { default: Package } = await import("../../../models/Package.js");
const { returnApi } = await import("../../shiprocket/returnShipment.js");
const { recomputeOrderStatus } = await import("./recomputeOrderStatus.js");
const { applyManualOrderStatusChange } = await import("../manualOrderStatus.js");
const { notificationService } = await import("../../index.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncShiprocketStatus", () => {
  it("404s when the order doesn't exist", async () => {
    Order.findOne.mockResolvedValue(null);
    await expect(syncShiprocketStatus({ orderId: "missing", adminId: "admin1" })).rejects.toThrow("Order not found");
  });

  it("advances a linked package forward from Shiprocket's live status and notifies once", async () => {
    Order.findOne.mockResolvedValue({ _id: "order1", id: "ORD-1", order_status: "shipped" });
    const pkg = { _id: "pkg1", shiprocket_order_id: "999", status: "shipped", awb: null, courier_name: null, etd: null };
    Package.find.mockResolvedValue([pkg]);
    returnApi.mockResolvedValue({ data: { shipments: [{ current_status: "Delivered", awb: "AWB1", courier_name: "BlueDart" }] } });
    recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order1", id: "ORD-1", order_status: "delivered" },
      statusChanged: true,
    });

    const result = await syncShiprocketStatus({ orderId: "order1", adminId: "admin1" });

    expect(Package.updateOne).toHaveBeenCalledWith(
      { _id: "pkg1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "delivered", awb: "AWB1", courier_name: "BlueDart" }) }),
    );
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ORDER_DELIVERED" }),
    );
    expect(result.order.order_status).toBe("delivered");
    expect(result.changed).toBe(true);
  });

  it("only updates courier metadata, without a status regression, when Shiprocket hasn't moved forward", async () => {
    Order.findOne.mockResolvedValue({ _id: "order1", id: "ORD-1", order_status: "delivered" });
    const pkg = { _id: "pkg1", shiprocket_order_id: "999", status: "delivered", awb: null, courier_name: null, etd: null };
    Package.find.mockResolvedValue([pkg]);
    returnApi.mockResolvedValue({ data: { shipments: [{ current_status: "Delivered", awb: "AWB2" }] } });
    recomputeOrderStatus.mockResolvedValue({ order: { _id: "order1", id: "ORD-1", order_status: "delivered" }, statusChanged: false });

    const result = await syncShiprocketStatus({ orderId: "order1", adminId: "admin1" });

    expect(Package.updateOne).toHaveBeenCalledWith({ _id: "pkg1" }, { $set: expect.objectContaining({ awb: "AWB2", shiprocket_status: "Delivered" }) });
    expect(notificationService.sendOrderNotification).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
  });

  it("rejects an order with no Shiprocket link at all, pointing at the link-order action instead", async () => {
    Order.findOne.mockResolvedValue({ _id: "order1", id: "ORD-1", order_status: "confirmed", shiprocket_order_id: null });
    Package.find.mockResolvedValue([]);
    await expect(syncShiprocketStatus({ orderId: "order1", adminId: "admin1" })).rejects.toThrow(/Link Shiprocket order/);
    expect(returnApi).not.toHaveBeenCalled();
  });

  it("advances a legacy (pre-Package-model) order via the shared manual-status service", async () => {
    const order = { _id: "order1", id: "ORD-1", order_status: "processing", shiprocket_order_id: "4271", awb: null, courier_name: null, etd: null };
    Order.findOne.mockResolvedValue(order);
    Package.find.mockResolvedValue([]);
    returnApi.mockResolvedValue({ data: { shipments: [{ current_status: "Delivered", awb: "AWB3" }] } });
    applyManualOrderStatusChange.mockResolvedValue({ id: "ORD-1", order_status: "delivered" });

    const result = await syncShiprocketStatus({ orderId: "order1", adminId: "admin1" });

    expect(applyManualOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ order, status: "delivered", changedBy: "admin1" }),
    );
    expect(Order.updateOne).toHaveBeenCalledWith({ _id: "order1" }, { $set: expect.objectContaining({ awb: "AWB3", shiprocket_status: "Delivered" }) });
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ORDER_DELIVERED" }),
    );
    expect(result.order.order_status).toBe("delivered");
  });
});
