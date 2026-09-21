import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../../models/Package.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn(), findById: vi.fn(), exists: vi.fn() } }));
vi.mock("../../shiprocket/returnShipment.js", () => ({ returnApi: vi.fn() }));
vi.mock("./recomputeOrderStatus.js", () => ({ recomputeOrderStatus: vi.fn() }));
vi.mock("../manualOrderStatus.js", async () => {
  const actual = await vi.importActual("../manualOrderStatus.js");
  return { ...actual, applyManualOrderStatusChange: vi.fn() };
});
vi.mock("../../index.js", () => ({
  notificationService: { sendOrderNotification: vi.fn() },
}));

vi.mock("./applyShiprocketShipment.js", async () => {
  const actual = await vi.importActual("./applyShiprocketShipment.js");
  return { ...actual, applyLegacyShipment: vi.fn() };
});
const { applyLegacyShipment } = await import("./applyShiprocketShipment.js");
const { syncShiprocketStatus } = await import("./syncShiprocketStatus.js");
const { default: Order } = await import("../../../models/Order.js");
const { default: Package } = await import("../../../models/Package.js");
const { returnApi } = await import("../../shiprocket/returnShipment.js");
const { recomputeOrderStatus } = await import("./recomputeOrderStatus.js");
const { applyManualOrderStatusChange } = await import("../manualOrderStatus.js");
const { notificationService } = await import("../../index.js");

beforeEach(() => {
  vi.clearAllMocks();
  Package.findOneAndUpdate.mockImplementation(async (filter, update) => ({ _id: filter._id, ...update.$set }));
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

    expect(Package.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "pkg1", status: "shipped" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "delivered", awb: "AWB1", courier_name: "BlueDart" }) }),
      { new: true },
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

    expect(Package.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: "pkg1", status: "delivered" }), { $set: expect.objectContaining({ awb: "AWB2", shiprocket_status: "Delivered" }) }, { new: true });
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
    applyLegacyShipment.mockResolvedValue({ order: { id: "ORD-1", order_status: "delivered" }, changed: true, statusChanged: true });

    const result = await syncShiprocketStatus({ orderId: "order1", adminId: "admin1" });

    expect(applyLegacyShipment).toHaveBeenCalledWith(expect.objectContaining({ order, shipment: expect.objectContaining({ awb: "AWB3", current_status: "Delivered" }) }));
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ORDER_DELIVERED" }),
    );
    expect(result.order.order_status).toBe("delivered");
  });
});

it('syncs each package independently, keeps successes, and never fetches the parent legacy link', async () => {
  Order.findOne.mockResolvedValue({ _id: 'o1', id: 'ORD-1', order_status: 'packed', shiprocket_order_id: 'LEGACY' });
  Package.find.mockResolvedValue([
    { _id: 'p1', status: 'packed', shiprocket_order_id: '100' },
    { _id: 'p2', status: 'packed', shiprocket_order_id: '200' },
    { _id: 'p3', status: 'packed' },
  ]);
  returnApi.mockImplementation(async (_, path) => {
    if (path.endsWith('200')) throw new Error('Provider timeout');
    return { data: { id: 100, shipments: [{ id: 1, current_status: 'Delivered', awb: 'A1' }] } };
  });
  recomputeOrderStatus.mockResolvedValue({ order: { id: 'ORD-1', order_status: 'partially_delivered' }, statusChanged: true });
  const result = await syncShiprocketStatus({ orderId: 'o1', adminId: 'a1' });
  expect(result.results.map(r => r.outcome)).toEqual(['synced', 'error', 'unlinked']);
  expect(result.order.order_status).toBe('partially_delivered');
  expect(returnApi.mock.calls.map(call => call[1])).toEqual(['orders/show/100', 'orders/show/200']);
  expect(notificationService.sendOrderNotification).not.toHaveBeenCalled();
});

it('retries only selected packages and rejects package IDs belonging to another order', async () => {
  Order.findOne.mockResolvedValue({ _id: 'o1', order_status: 'packed' });
  Package.find.mockResolvedValue([{ _id: 'p1', status: 'packed', shiprocket_order_id: '100' }, { _id: 'p2', status: 'packed', shiprocket_order_id: '200' }]);
  returnApi.mockResolvedValue({ data: { id: 200, shipments: [{ id: 2, current_status: 'Packed' }] } });
  recomputeOrderStatus.mockResolvedValue({ order: { order_status: 'packed' }, statusChanged: false });
  await syncShiprocketStatus({ orderId: 'o1', packageIds: ['p2'] });
  expect(returnApi).toHaveBeenCalledTimes(1);
  expect(returnApi).toHaveBeenCalledWith('GET', 'orders/show/200');
  await expect(syncShiprocketStatus({ orderId: 'o1', packageIds: ['foreign'] })).rejects.toThrow('does not belong');
});

it('does not apply one verified snapshot across unrelated packages', async () => {
  Order.findOne.mockResolvedValue({ _id: 'o1', order_status: 'packed' });
  Package.find.mockResolvedValue([{ _id: 'p1', status: 'packed', shiprocket_order_id: '100' }, { _id: 'p2', status: 'packed', shiprocket_order_id: '200' }]);
  recomputeOrderStatus.mockResolvedValue({ order: { order_status: 'packed' }, statusChanged: false });
  const result = await syncShiprocketStatus({ orderId: 'o1', verifiedRemote: { id: 100, shipments: [{ id: 1, current_status: 'Packed' }] } });
  expect(result.results[1].outcome).toBe('error');
  expect(Package.findOneAndUpdate).toHaveBeenCalledTimes(1);
});
