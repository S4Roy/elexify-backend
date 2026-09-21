import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../models/Package.js", () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/ReturnRequest.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../models/OrderScans.js", () => ({
  default: { findOne: vi.fn(), insertMany: vi.fn() },
}));
vi.mock("../../../models/WebhookLog.js", () => ({ default: { create: vi.fn() } }));
vi.mock("../../../services/index.js", () => ({
  orderService: { recomputeOrderStatus: vi.fn() },
  notificationService: { sendOrderNotification: vi.fn() },
}));

const { updateOrderStatus } = await import("./updateOrderStatus.js");
const { default: Package } = await import("../../../models/Package.js");
const { default: Order } = await import("../../../models/Order.js");
const { default: ReturnRequest } = await import("../../../models/ReturnRequest.js");
const { default: OrderScans } = await import("../../../models/OrderScans.js");
const { default: WebhookLog } = await import("../../../models/WebhookLog.js");
const { orderService, notificationService } = await import("../../../services/index.js");

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  orderService.recomputeOrderStatus.mockResolvedValue({
    order: { _id: "order1", id: "ORD-1", order_status: "packed" }, statusChanged: false,
  });
  Package.findOne.mockResolvedValue(null);
  Order.findOne.mockResolvedValue(null);
  ReturnRequest.findOne.mockResolvedValue(null);
  // OrderScans.findOne(...).lean() — mirror Mongoose's chainable query API.
  OrderScans.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  OrderScans.insertMany.mockResolvedValue(undefined);
  WebhookLog.create.mockResolvedValue({});
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
      $or: [
        { shiprocket_order_id: "13905312" }, { reference_id: "13905312" },
        { shiprocket_order_id: "ORD-000019-P1" }, { reference_id: "ORD-000019-P1" },
        { awb: "59629792084" },
      ],
    });
    expect(Package.updateOne).toHaveBeenCalledWith(
      { _id: "pkg1" },
      { $set: expect.objectContaining({ awb: "59629792084", courier_name: "Delhivery Surface", etd: "2021-07-03", shiprocket_status: "Pickup Scheduled" }) },
    );
    // "Pickup Scheduled" normalizes to "packed" — same as the package's
    // current status — so this must not be treated as a status transition.
    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderService.recomputeOrderStatus).toHaveBeenCalled();
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
    expect(orderService.recomputeOrderStatus).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Reproduces a real production crash: Shiprocket sent a current_timestamp
  // that doesn't parse, `new Date(...)` silently became "Invalid Date", and
  // that reached Package.findOneAndUpdate's $set — which is harmless against
  // a mock, but against real Mongoose (Date schema type) throws a
  // CastError/ValidationError that was surfacing as an unhandled 500.
  it("falls back to now() when current_timestamp doesn't parse, instead of writing an Invalid Date", async () => {
    const pkg = {
      _id: "pkg5",
      order_id: "order5",
      status: "shipped",
      awb: "111",
      courier_name: "Delhivery",
      etd: null,
      timeline: [{ status: "packed" }, { status: "shipped" }],
      shipped_at: new Date("2021-06-24T00:00:00Z"),
      delivered_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, status: "delivered" });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order5", id: "ORD-000021", order_status: "delivered" },
      statusChanged: true,
    });

    const req = {
      headers: {},
      body: {
        current_status: "Delivered",
        order_id: "13905400",
        current_timestamp: "not-a-real-date",
        scans: [],
      },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    const [, update] = Package.findOneAndUpdate.mock.calls[0];
    expect(update.$set.delivered_at).toBeInstanceOf(Date);
    expect(Number.isNaN(update.$set.delivered_at.valueOf())).toBe(false);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("preserves an unmapped Shiprocket status on a legacy order", async () => {
    Package.findOne.mockResolvedValue(null);
    Order.findOne.mockResolvedValue({ id: "ORD-000022", order_status: "processing", meta: {}, save: vi.fn().mockResolvedValue(undefined) });

    const req = {
      headers: {},
      body: { current_status: "Some Unmapped Carrier Status", order_id: "ORD-000022", scans: [] },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  // The whole point of a webhook receiver: never hand the sender a reason
  // to retry a payload that will fail identically every time. This drives
  // the exact crash from production (order.save() rejecting on a bad
  // field) through the top-level catch and confirms it still acks 200.
  it("acks 200 even when saving the order throws (legacy path)", async () => {
    Package.findOne.mockResolvedValue(null);
    Order.findOne.mockResolvedValue({
      id: "ORD-000023",
      order_status: "processing",
      meta: {},
      save: vi.fn().mockRejectedValue(new Error('orders validation failed: shipped_at: Cast to date failed')),
    });

    const req = {
      headers: {},
      body: { current_status: "Shipped", order_id: "ORD-000023", scans: [] },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });
});

describe("updateOrderStatus — webhook audit log", () => {
  it("records a processed call with correlation fields and the raw payload", async () => {
    const pkg = {
      _id: "pkg9",
      order_id: "order9",
      status: "shipped",
      awb: "111",
      courier_name: "Delhivery",
      etd: null,
      timeline: [{ status: "packed" }, { status: "shipped" }],
      shipped_at: new Date("2021-06-24T00:00:00Z"),
      delivered_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, status: "delivered" });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order9", id: "ORD-000030", order_status: "delivered" },
      statusChanged: true,
    });

    const body = {
      awb: 999,
      current_status: "Delivered",
      order_id: "13905999",
      channel_order_id: "ORD-000030-P1",
      scans: [],
    };
    const req = { headers: {}, body };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(WebhookLog.create).toHaveBeenCalledTimes(1);
    const logged = WebhookLog.create.mock.calls[0][0];
    expect(logged).toMatchObject({
      provider: "shiprocket",
      event_type: "order_status",
      order_id: "ORD-000030-P1",
      package_id: "pkg9",
      shiprocket_order_id: "13905999",
      awb: "999",
      incoming_status: "Delivered",
      mapped_status: "delivered",
      outcome: "processed",
      status_code: 200,
    });
    expect(logged.payload).toEqual(body);
  });

  // Regression test for a real production issue: the admin Webhook Logs
  // page showed "—" for Order ID on nearly every row because Shiprocket's
  // actual webhook deliveries often omit channel_order_id or send it as
  // the dashboard's own literal placeholder text — even though the order
  // was correctly correlated to a local Package/Order server-side. The log
  // must use that server-resolved order, not the raw (unreliable) field.
  it("logs the server-resolved order id, not the raw channel_order_id, when a package is matched", async () => {
    const pkg = {
      _id: "pkg10", order_id: "order10", status: "shipped", awb: "111", courier_name: "Delhivery",
      etd: null, timeline: [{ status: "packed" }, { status: "shipped" }],
      shipped_at: new Date("2021-06-24T00:00:00Z"), delivered_at: null,
    };
    Package.findOne.mockResolvedValue(pkg);
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, status: "delivered" });
    // The resolved Order's own human id differs from whatever Shiprocket's
    // webhook happened to carry as channel_order_id — proving the log uses
    // the server-side correlation, not the raw field.
    Order.findOne.mockResolvedValue({ id: "ORD-000040" });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order10", id: "ORD-000040", order_status: "delivered" },
      statusChanged: true,
    });

    const body = {
      awb: 111,
      current_status: "Delivered",
      order_id: "13906000",
      channel_order_id: "enter your channel order id",
      scans: [],
    };
    await updateOrderStatus({ headers: {}, body }, mockRes(), vi.fn());

    expect(Order.findOne).toHaveBeenCalledWith({ _id: "order10" });
    const logged = WebhookLog.create.mock.calls[0][0];
    expect(logged.order_id).toBe("ORD-000040");
  });

  it("does not log Shiprocket's dashboard placeholder text as an order id when nothing was resolved", async () => {
    Package.findOne.mockResolvedValue(null);
    Order.findOne.mockResolvedValue(null);

    const body = {
      current_status: "Delivered",
      channel_order_id: "Enter your channel order ID",
      scans: [],
    };
    await updateOrderStatus({ headers: {}, body }, mockRes(), vi.fn());

    const logged = WebhookLog.create.mock.calls[0][0];
    expect(logged.order_id).toBeNull();
  });

  it("records a tracking-only update for an unmapped status with no package_id", async () => {
    Package.findOne.mockResolvedValue(null);
    Order.findOne.mockResolvedValue({ id: "ORD-000031", order_status: "processing", meta: {}, save: vi.fn().mockResolvedValue(undefined) });

    const req = {
      headers: {},
      body: { current_status: "Some Unmapped Carrier Status", order_id: "ORD-000031", scans: [] },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(WebhookLog.create).toHaveBeenCalledTimes(1);
    const logged = WebhookLog.create.mock.calls[0][0];
    expect(logged.outcome).toBe("processed");
    expect(logged.package_id).toBeNull();
  });

  it("records an error outcome, and never lets a logging failure break the response", async () => {
    WebhookLog.create.mockRejectedValue(new Error("Mongo down"));
    Package.findOne.mockResolvedValue(null);
    Order.findOne.mockResolvedValue({
      id: "ORD-000032",
      order_status: "processing",
      meta: {},
      save: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const req = {
      headers: {},
      body: { current_status: "Shipped", order_id: "ORD-000032", scans: [] },
    };
    const res = mockRes();

    await updateOrderStatus(req, res, vi.fn());

    expect(WebhookLog.create).toHaveBeenCalledTimes(1);
    expect(WebhookLog.create.mock.calls[0][0].outcome).toBe("error");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});


describe('Shiprocket legacy identifier correlation', () => {
  it('checks both channel and provider IDs plus AWB for legacy orders', async () => {
    const res = mockRes();
    await updateOrderStatus({ headers: {}, body: {
      order_id: '15781', channel_order_id: 'ORD-000019', awb: 'FH010390455IN', current_status: 'shipped',
    } }, res, vi.fn());
    expect(Order.findOne).toHaveBeenCalledWith({ $or: [
      { id: '15781' }, { shiprocket_order_id: '15781' },
      { id: 'ORD-000019' }, { shiprocket_order_id: 'ORD-000019' },
      { awb: 'FH010390455IN' },
    ] });
  });
  it('can correlate historical orders using only AWB', async () => {
    await updateOrderStatus({ headers: {}, body: { awb: 'FH010390455IN', current_status: 'shipped' } }, mockRes(), vi.fn());
    expect(Order.findOne).toHaveBeenCalledWith({ $or: [{ awb: 'FH010390455IN' }] });
  });
  it('does not query legacy orders with an empty selector for shipment-only events', async () => {
    await updateOrderStatus({ headers: {}, body: { shipment_id: 'shipment-1', current_status: 'shipped' } }, mockRes(), vi.fn());
    expect(Order.findOne).not.toHaveBeenCalled();
  });
});


describe("package webhook replay recovery", () => {
  it("repairs a stale parent after the package status was already saved", async () => {
    Package.findOne.mockResolvedValue({
      _id: "pkg1", order_id: "order1", status: "out_for_delivery",
      timeline: [{ status: "packed" }, { status: "out_for_delivery" }],
    });
    orderService.recomputeOrderStatus.mockResolvedValue({
      order: { _id: "order1", id: "ORD-1", order_status: "out_for_delivery" }, statusChanged: true,
    });
    const res = mockRes();
    await updateOrderStatus({ headers: {}, body: { order_id: "123", current_status: "OUT FOR DELIVERY" } }, res, vi.fn());
    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderService.recomputeOrderStatus).toHaveBeenCalledWith({ orderId: "order1", source: "carrier" });
    expect(notificationService.sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({ event: "ORDER_OUT_FOR_DELIVERY" }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("does not send another notification when replay leaves the order unchanged", async () => {
    Package.findOne.mockResolvedValue({ _id: "pkg1", order_id: "order1", status: "packed", timeline: [{ status: "packed" }] });
    await updateOrderStatus({ headers: {}, body: { order_id: "123", current_status: "OUT FOR PICKUP" } }, mockRes(), vi.fn());
    expect(orderService.recomputeOrderStatus).toHaveBeenCalled();
    expect(notificationService.sendOrderNotification).not.toHaveBeenCalled();
  });
});


it("persists RTO tracking without marking a package delivered or refunded", async () => {
  Package.findOne.mockResolvedValue({ _id: "pkg1", order_id: "order1", status: "shipped" });
  await updateOrderStatus({ headers: {}, body: { order_id: "123", current_status: "RTO IN TRANSIT", current_timestamp: "21 09 2026 08:30:00" } }, mockRes(), vi.fn());
  expect(Package.updateOne).toHaveBeenCalledWith({ _id: "pkg1" }, { $set: {
    shiprocket_status: "RTO IN TRANSIT", shiprocket_status_updated_at: new Date("2026-09-21T03:00:00Z"),
  } });
  expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
  expect(orderService.recomputeOrderStatus).not.toHaveBeenCalled();
});
