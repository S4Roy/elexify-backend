import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../models/Package.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/ReturnRequest.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/OrderScans.js", () => ({
  default: { findOne: vi.fn(), insertMany: vi.fn() },
}));
vi.mock("../../../services/index.js", () => ({
  orderService: { recomputeOrderStatus: vi.fn() },
  notificationService: { sendOrderNotification: vi.fn() },
}));

const { updateOrderStatus } = await import("./updateOrderStatus.js");
const { default: Package } = await import("../../../models/Package.js");
const { default: ReturnRequest } = await import("../../../models/ReturnRequest.js");
const { default: OrderScans } = await import("../../../models/OrderScans.js");
const { orderService, notificationService } = await import("../../../services/index.js");

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  ReturnRequest.findOne.mockResolvedValue(null);
  // OrderScans.findOne(...).lean() — mirror Mongoose's chainable query API.
  OrderScans.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  OrderScans.insertMany.mockResolvedValue(undefined);
});

describe("updateOrderStatus — Shiprocket forward-shipment webhook", () => {
  // Shiprocket's own "Order/Shipment" webhook doc uses this exact shape;
  // status_id 38 is Shiprocket's real "Pickup Scheduled" code. Courier is
  // chosen manually in the Shiprocket dashboard, so this is the first event
  // that ever carries an awb/courier_name for the package — before this,
  // both are null.
  it("saves awb/courier_name from a Pickup Scheduled event without flipping package status", async () => {
    const pkg = {
      _id: "pkg1",
      order_id: "order1",
      status: "packed",
      awb: null,
      courier_name: null,
      etd: null,
      timeline: [],
      shipped_at: null,
      delivered_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);

    const req = {
      headers: {},
      body: {
        awb: 59629792084,
        current_status: "Pickup Scheduled",
        order_id: "13905312",
        current_timestamp: "2021-07-01 10:00:00",
        etd: "2021-07-03",
        current_status_id: 38,
        shipment_status: "Pickup Scheduled",
        shipment_status_id: 38,
        channel_order_id: "ORD-000019-P1",
        channel: "Custom",
        courier_name: "Delhivery Surface",
        scans: [],
      },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(Package.findOne).toHaveBeenCalledWith({
      $or: [{ shiprocket_order_id: "13905312" }, { awb: "59629792084" }],
    });
    expect(Package.updateOne).toHaveBeenCalledWith(
      { _id: "pkg1" },
      { $set: { awb: "59629792084", courier_name: "Delhivery Surface", etd: "2021-07-03" } },
    );
    // "Pickup Scheduled" normalizes to "packed" — same as the package's
    // current status — so this must not be treated as a status transition.
    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderService.recomputeOrderStatus).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Verbatim payload shape from Shiprocket's own webhook documentation.
  it("processes a Delivered event: status, awb/courier, scans, and the order recompute", async () => {
    const pkg = {
      _id: "pkg2",
      order_id: "order2",
      status: "shipped",
      // Still null here — simulates the "Pickup Scheduled" event never
      // having arrived, so this Delivered event is the first to carry
      // awb/courier_name at all.
      awb: null,
      courier_name: null,
      etd: null,
      timeline: [{ status: "packed" }, { status: "shipped" }],
      shipped_at: new Date("2021-06-24T00:00:00Z"),
      delivered_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, _id: "pkg2", status: "delivered" });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order2", id: "ORD-000019", order_status: "delivered" },
      statusChanged: true,
      previousStatus: "shipped",
    });

    const req = {
      headers: {},
      body: {
        awb: 59629792084,
        current_status: "Delivered",
        order_id: "13905312",
        current_timestamp: "2021-07-02 16:41:59",
        etd: "2021-07-02 16:41:59",
        current_status_id: 7,
        shipment_status: "Delivered",
        shipment_status_id: 7,
        channel_order_id: "enter your channel order id",
        channel: "enter your channel name",
        courier_name: "enter courier_name",
        scans: [
          { date: "2019-06-25 12:08:00", activity: "SHIPMENT DELIVERED", location: "PATIALA" },
          { date: "2019-06-25 12:06:00", activity: "NECESSARY CHARGES PENDING FROM CONSIGNEE", location: "PATIALA" },
          { date: "2019-06-25 10:18:00", activity: "SHIPMENT OUT FOR DELIVERY", location: "PATIALA" },
          { date: "2019-06-25 09:40:00", activity: "SHIPMENT ARRIVED", location: "PATIALA" },
          { date: "2019-06-25 07:32:00", activity: "SHIPMENT FURTHER CONNECTED", location: "AMBALA AIR HUB" },
          { date: "2019-06-25 07:03:00", activity: "SHIPMENT ARRIVED AT HUB", location: "AMBALA AIR HUB" },
          { date: "2019-06-25 00:45:00", activity: "SHIPMENT FURTHER CONNECTED", location: "KAPASHERA HUB" },
          { date: "2019-06-25 00:20:00", activity: "SHIPMENT ARRIVED AT HUB", location: "KAPASHERA HUB" },
          { date: "2019-06-24 23:17:00", activity: "SHIPMENT FURTHER CONNECTED", location: "COD PROCESSING CENTRE I" },
          { date: "2019-06-24 21:14:00", activity: "SHIPMENT ARRIVED", location: "COD PROCESSING CENTRE I" },
          { date: "2019-06-24 18:56:00", activity: "SHIPMENT PICKED UP", location: "COD PROCESSING CENTRE I" },
        ],
      },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(Package.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = Package.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "pkg2" });
    expect(update.$set).toMatchObject({
      status: "delivered",
      awb: "59629792084",
      courier_name: "enter courier_name",
    });
    expect(update.$set.delivered_at).toBeInstanceOf(Date);
    expect(update.$push.timeline.status).toBe("delivered");

    expect(OrderScans.insertMany).toHaveBeenCalledTimes(1);
    expect(OrderScans.insertMany.mock.calls[0][0]).toHaveLength(11);

    expect(orderService.recomputeOrderStatus).toHaveBeenCalledWith({
      orderId: "order2",
      source: "carrier",
    });
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ORDER_DELIVERED", dedupeKey: "ORD-000019:ORDER_DELIVERED" }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("cancels a still-packed package on a Cancelled event and stamps cancelled_at", async () => {
    const pkg = {
      _id: "pkg3",
      order_id: "order3",
      status: "packed",
      awb: null,
      courier_name: null,
      etd: null,
      timeline: [{ status: "packed" }],
      shipped_at: null,
      delivered_at: null,
      cancelled_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, status: "cancelled" });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order3", id: "ORD-000020", order_status: "confirmed" },
      statusChanged: false,
      previousStatus: "packed",
    });

    const req = {
      headers: {},
      body: {
        current_status: "Cancelled",
        order_id: "13905399",
        shipment_status: "Cancelled",
        scans: [],
      },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(Package.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = Package.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "pkg3" });
    expect(update.$set.status).toBe("cancelled");
    expect(update.$set.cancelled_at).toBeInstanceOf(Date);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ignores a stale Cancelled event against an already-shipped package", async () => {
    const pkg = {
      _id: "pkg4",
      order_id: "order4",
      status: "shipped",
      awb: "111",
      courier_name: "Delhivery",
      etd: null,
      timeline: [{ status: "packed" }, { status: "shipped" }],
      shipped_at: new Date("2021-06-24T00:00:00Z"),
      delivered_at: null,
      cancelled_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);

    const req = {
      headers: {},
      body: {
        current_status: "Cancelled",
        order_id: "13905399",
        shipment_status: "Cancelled",
        scans: [],
      },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderService.recomputeOrderStatus).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
