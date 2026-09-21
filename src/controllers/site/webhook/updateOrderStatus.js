import { shiprocketEventDate } from "../../../helpers/order/shiprocketStatus.js";
import { packageReferenceQuery, orderReferenceQuery } from "../../../helpers/order/shipmentReferences.js";
import { validReturnWebhookToken } from "../../../services/returnService/webhookAuth.js";
import { StatusError } from "../../../config/index.js";
import { applyReverseEvent } from "../../../services/returnService/pickup.js";
import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import ReturnRequest from "../../../models/ReturnRequest.js";
import OrderScans from "../../../models/OrderScans.js";
import WebhookLog from "../../../models/WebhookLog.js";
import moment from "moment-timezone";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { applyPackageShipment, applyLegacyShipment, fulfillmentBlocked } from "../../../services/orderService/packages/applyShiprocketShipment.js";
import { orderService, notificationService } from "../../../services/index.js";
import { ORDER_STATUS } from "../../../constants/orderStatus.js";

// No entries for partially_shipped/partially_delivered — a lookup miss
// there is intentional: an existing customer notification event doesn't
// exist for those transitions, so they silently don't fire one (safe,
// non-breaking) rather than needing new templates for this feature.
const SHIPMENT_STATUS_EVENTS = {
  [ORDER_STATUS.SHIPPED]: "ORDER_SHIPPED",
  [ORDER_STATUS.OUT_FOR_DELIVERY]: "ORDER_OUT_FOR_DELIVERY",
  [ORDER_STATUS.DELIVERED]: "ORDER_DELIVERED",
};

// Reconcile even on replay: a previous delivery may have saved the package
// before failing to update its parent order.
const reconcilePackageOrder = async (orderId) => {
  const result = await orderService.recomputeOrderStatus({ orderId, source: "carrier" });
  const event = SHIPMENT_STATUS_EVENTS[result.order.order_status];
  if (result.statusChanged && event) {
    notificationService.sendOrderNotification({
      order: result.order, event, dedupeKey: `${result.order.id}:${event}`,
    });
  }
  return result;
};

const processReverseWebhook = async ({ orderIds, awbStr, incoming, courierName, eventTimestamp, shipmentId, token }) => {
  const refs = [
    ...orderIds.flatMap(id => [{ request_number: id }, { 'pickup.shiprocket_order_id': id }]),
    ...(awbStr ? [{ 'pickup.shiprocket_awb': awbStr }, { 'pickup.tracking_number': awbStr }] : []),
    ...(shipmentId ? [{ 'pickup.shiprocket_shipment_id': String(shipmentId) }] : []),
  ];
  if (!refs.length) return null;
  const request = await ReturnRequest.findOne({ $or: refs });
  if (!request) return null;
  if (!validReturnWebhookToken(token)) throw StatusError.forbidden('Invalid return webhook token');
  return { request: await applyReverseEvent({ request, raw: incoming, at: eventTimestamp, awb: awbStr, courier: courierName }) };
};

// Best-effort audit write — this must never affect the response the
// webhook sender sees, so any failure here is swallowed by the caller.
const recordWebhookLog = ({ body, statusCode, responseBody, processingMs, packageId, resolvedOrderId }) => {
  const awbStr = body?.awb != null ? String(body.awb) : null;
  const incomingStatus = (body?.current_status || body?.shipment_status || "").toString().trim() || null;
  const mappedStatus = incomingStatus
    ? normalizeOrderStatus(incomingStatus.toLowerCase().replace(/\s+/g, "_"))
    : null;
  // Prefer the order we actually correlated this webhook to server-side
  // (via the matched Package/Order/ReturnRequest — see the `resolvedOrderId`
  // assignments below) over Shiprocket's own channel_order_id field: in
  // practice that field is frequently missing or left at its dashboard
  // placeholder ("enter your channel order id") on real webhook deliveries,
  // even though it's reliably present in orders/show API responses. Only
  // fall back to it when nothing was actually resolved (e.g. no local
  // match was found at all), purely as a debugging breadcrumb.
  const orderId = resolvedOrderId
    || (typeof body?.channel_order_id === "string" && body.channel_order_id.trim() && body.channel_order_id.trim().toLowerCase() !== "enter your channel order id"
      ? body.channel_order_id.trim()
      : null);
  const shiprocketOrderId = body?.order_id != null ? String(body.order_id) : null;

  const outcome = statusCode >= 500 || responseBody?.status === "error"
    ? "error"
    : responseBody?.status === "ignored"
      ? "ignored"
      : "processed";

  return WebhookLog.create({
    provider: "shiprocket",
    event_type: "order_status",
    order_id: orderId,
    package_id: packageId || null,
    shiprocket_order_id: shiprocketOrderId,
    awb: awbStr,
    incoming_status: incomingStatus,
    mapped_status: mappedStatus,
    outcome,
    outcome_detail: responseBody?.message || null,
    status_code: statusCode,
    payload: body || {},
    processing_ms: processingMs,
  });
};

/**
 * Shiprocket webhook -> update order status + save scans
 */
export const updateOrderStatus = async (req, res, next) => {
  const startedAt = Date.now();
  const body = req.body || {};
  // Every branch below is already a 200 — this always logs one audit entry
  // (best-effort, never blocking or altering the actual response) and then
  // sends the same response every existing call site sent.
  let matchedPackageId = null;
  // Set as soon as any branch below actually correlates this webhook to a
  // real local Order — read by `respond` via closure (same pattern as
  // matchedPackageId) so every response path logs it without threading an
  // extra parameter through each call site.
  let resolvedOrderId = null;
  const respond = (payload) => {
    recordWebhookLog({
      body,
      statusCode: 200,
      responseBody: payload,
      processingMs: Date.now() - startedAt,
      packageId: matchedPackageId,
      resolvedOrderId,
    }).catch((err) => console.warn("WebhookLog write failed:", err?.message || err));
    return res.status(200).json(payload);
  };

  try {
    // destructure incoming body (be defensive)
    const {
      awb,
      current_status,
      order_id,
      current_timestamp,
      etd,
      current_status_id,
      shipment_status,
      shipment_status_id,
      channel_order_id,
      channel,
      courier_name,
      scans,
      ...rest
    } = body;

    // Accept numeric AWB as string
    const awbStr = awb != null ? String(awb) : null;
    const orderIds = [...new Set([order_id, channel_order_id]
      .filter(value => typeof value === 'string' || typeof value === 'number')
      .map(value => String(value).trim()).filter(Boolean))];
    const incomingOrderId = orderIds[0] || null;

    if (!incomingOrderId && !awbStr && !body.shipment_id) {
      // Nothing to correlate — respond 200 so webhook doesn't block
      return respond({
        status: "ok",
        message: "No order identifier (order_id/channel_order_id/awb) provided",
      });
    }

    const incoming = (current_status || shipment_status || "")
      .toString()
      .trim()
      .toLowerCase();
    // Shiprocket doesn't guarantee current_timestamp is a parseable date —
    // an unparseable value must never reach a Date-typed field as-is (an
    // "Invalid Date" fails Mongoose's cast and throws), so it falls back to
    // "now" instead.
    const eventTimestamp = shiprocketEventDate(current_timestamp);

    // Reverse shipments are correlated by the return number/Shiprocket id/AWB
    // and update the same customer-visible event log as manual admin actions.
    const reverse = await processReverseWebhook({ orderIds, awbStr, incoming, courierName: courier_name, eventTimestamp, shipmentId: body.shipment_id, token: req.headers["x-api-key"] });
    if (reverse) {
      const parentOrder = await Order.findOne({ _id: reverse.request.order_id });
      resolvedOrderId = parentOrder?.id || null;
      // A webhook retries on any non-2xx — an unsupported status will
      // never become supported on retry, so this acks with 200 rather
      // than triggering an endless resend loop from Shiprocket's side.
      if (reverse.unsupported) return respond({ status: "ignored", message: "Unsupported reverse shipment status" });
      return respond({ status: "success", message: "Return pickup status processed", data: { return_request_id: reverse.request._id, pickup_status: reverse.request.pickup.status } });
    }

    // Multi-package fulfillment: correlate to a specific Package first — by
    // our own composite shiprocket_order_id (e.g. "ORD-010708-P2"), else
    // AWB, else Shiprocket's own shipment id. A pre-feature order shipped
    // under the old single-shipment flow has zero Package docs, so this
    // simply finds nothing and falls through to the untouched legacy path
    // below — that's what keeps historical orders fully backward compatible.
    const matches = await Package.find(packageReferenceQuery({ orderIds, awb: awbStr, shipmentId: body.shipment_id }));
    if (matches.length > 1) {
      return respond({ status: "ignored", message: "Conflicting package identifiers; review shipment links" });
    }
    const pkg = matches[0];
    if (pkg) {
      matchedPackageId = pkg._id;
      const parentOrder = await Order.findOne({ _id: pkg.order_id });
      resolvedOrderId = parentOrder?.id || null;

      const result = await applyPackageShipment({
        pkg, shipment: { id: body.shipment_id, awb: awbStr, courier_name, etd, current_status: current_status || shipment_status },
        at: eventTimestamp, raw: body, allowTransition: !fulfillmentBlocked(parentOrder),
      });
      const updatedPackage = result.pkg;

      // Persist scan records against the parent order, same dedupe logic
      // as the legacy path below.
      if (Array.isArray(scans) && scans.length) {
        const scanDocs = [];
        for (const s of scans) {
          const scanDateRaw = s.date || s.scanned_at || s.timestamp || null;
          const scanDate = scanDateRaw ? moment(scanDateRaw).toDate() : null;
          const activity = (s.activity || s.activity_text || s.status || "").toString();
          const location = s.location || s.place || "";
          if (!activity) continue;
          const dupQuery = { order: pkg.order_id, awb: awbStr, activity };
          if (scanDate) dupQuery.date = scanDate;
          const exist = await OrderScans.findOne(dupQuery).lean();
          if (exist) continue;
          scanDocs.push({ order: pkg.order_id, awb: awbStr, activity, location, date: scanDate, raw: s, createdAt: new Date() });
        }
        if (scanDocs.length) {
          await OrderScans.insertMany(scanDocs, { ordered: false }).catch((insertErr) => {
            console.warn("OrderScans insertMany warning:", insertErr.message || insertErr);
          });
        }
      }

      const recomputedOrder = fulfillmentBlocked(parentOrder)
        ? parentOrder : (await reconcilePackageOrder(pkg.order_id)).order;

      return respond({
        status: "success",
        message: "Package status processed",
        data: {
          packageId: updatedPackage._id,
          orderId: recomputedOrder._id,
          mapped_status: updatedPackage.status,
          order_status: recomputedOrder.order_status,
        },
      });
    }

    // ── Legacy fallback: no Package doc correlates to this webhook (a
    // pre-feature order shipped under the old single-shipment flow) ──────
    // Try find forward order
    const orderQuery = orderReferenceQuery({ orderIds, awb: awbStr });
    const orderMatches = orderQuery.$or.length ? await Order.find(orderQuery) : [];
    if (orderMatches.length > 1) {
      return respond({ status: "ignored", message: "Conflicting order identifiers; review shipment links" });
    }
    let order = orderMatches[0];

    if (!order) {
      // Not found: log and return success (to avoid retries). You can persist webhook for later if you want.
      console.warn("Shiprocket webhook: order not found for", {
        incomingOrderId,
        awb: awbStr,
      });
      return respond({
        status: "ignored",
        message: "Order not found locally; webhook received",
        incomingOrderId,
        awb: awbStr,
      });
    }
    resolvedOrderId = order.id;
    // Never treat a package-backed order as a legacy shipment just because
    // this event could not be matched to a particular package.
    if (await Package.exists({ order_id: order._id })) {
      return respond({ status: "ignored", message: "Order has packages but no exact package matched; review shipment links" });
    }
    // ---- Persist scan records if present
    if (Array.isArray(scans) && scans.length) {
      // Build scan docs; avoid duplicates by checking date+activity+awb
      const scanDocs = [];
      for (const s of scans) {
        const scanDateRaw = s.date || s.scanned_at || s.timestamp || null;
        const scanDate = scanDateRaw ? moment(scanDateRaw).toDate() : null;
        const activity = (
          s.activity ||
          s.activity_text ||
          s.status ||
          ""
        ).toString();
        const location = s.location || s.place || "";

        if (!activity) continue;

        // check existing OrderScans for duplicate (same awb + activity + date)
        const dupQuery = {
          order: order._id,
          awb: awbStr,
          activity,
        };
        if (scanDate) dupQuery.date = scanDate;

        const exist = await OrderScans.findOne(dupQuery).lean();
        if (exist) continue;

        // prepare doc
        scanDocs.push({
          order: order._id,
          awb: awbStr,
          activity,
          location,
          date: scanDate,
          raw: s,
          createdAt: new Date(),
        });
      }

      if (scanDocs.length) {
        // insertMany
        try {
          await OrderScans.insertMany(scanDocs, { ordered: false });
        } catch (insertErr) {
          // ignore duplicate-key issues or log insertion error
          console.warn(
            "OrderScans insertMany warning:",
            insertErr.message || insertErr
          );
        }
      }
    }

    const result = await applyLegacyShipment({ order,
      shipment: { id: body.shipment_id, awb: awbStr, courier_name, etd, current_status: current_status || shipment_status }, at: eventTimestamp });
    order = result.order;
    const newStatus = order.order_status;
    const shipmentEvent = SHIPMENT_STATUS_EVENTS[newStatus];
    if (result.statusChanged && shipmentEvent) {
      notificationService.sendOrderNotification({ order, event: shipmentEvent, dedupeKey: `${order.id}:${shipmentEvent}` });
    }

    // Respond 200 (Shiprocket expects success).
    return respond({
      status: "success",
      message: "Order status processed",
      data: {
        orderId: order._id || order.id,
        mapped_status: newStatus,
        recordedEvents: "added",
      },
    });
  } catch (err) {
    // Always ack 200. A non-2xx makes Shiprocket retry this same payload
    // repeatedly (with no backoff guarantee), and most failures here are
    // deterministic — a bad/missing field, a validation error — so a retry
    // would just reproduce the identical failure forever instead of ever
    // recovering. Log it for manual investigation/replay instead of
    // relying on the sender's retry to fix a bug on our side.
    console.error("Shiprocket webhook processing error:", err);
    return respond({
      status: "error",
      message: "Failed to process webhook, logged for review",
      error: err?.message || err,
    });
  }
};
