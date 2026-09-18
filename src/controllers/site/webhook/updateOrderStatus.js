import { validReturnWebhookToken } from "../../../services/returnService/webhookAuth.js";
import { StatusError } from "../../../config/index.js";
import { applyReverseEvent } from "../../../services/returnService/pickup.js";
import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import ReturnRequest from "../../../models/ReturnRequest.js";
import OrderScans from "../../../models/OrderScans.js";
import moment from "moment-timezone";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { orderService, notificationService } from "../../../services/index.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../../constants/orderStatus.js";

// No entries for partially_shipped/partially_delivered — a lookup miss
// there is intentional: an existing customer notification event doesn't
// exist for those transitions, so they silently don't fire one (safe,
// non-breaking) rather than needing new templates for this feature.
const SHIPMENT_STATUS_EVENTS = {
  [ORDER_STATUS.SHIPPED]: "ORDER_SHIPPED",
  [ORDER_STATUS.OUT_FOR_DELIVERY]: "ORDER_OUT_FOR_DELIVERY",
  [ORDER_STATUS.DELIVERED]: "ORDER_DELIVERED",
};

// A Package only ever carries a shipment-stage status — never the order-
// level "confirmed"/"processing"/"partially_*" values normalizeOrderStatus
// can also return.
const PACKAGE_STATUS_MAP = {
  packed: "packed",
  shipped: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  returned: "returned",
};

// Shiprocket's webhook deliveries aren't guaranteed in order — a stale or
// duplicate event for a status the package has already moved past must be
// a no-op, never a regression (and never an error that makes Shiprocket
// retry forever).
const PACKAGE_STATUS_ORDER = ["packed", "shipped", "out_for_delivery", "delivered"];
const isForwardPackageTransition = (from, to) => {
  if (to === "returned") return from === "delivered";
  const fromIdx = PACKAGE_STATUS_ORDER.indexOf(from);
  const toIdx = PACKAGE_STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx > fromIdx;
};

const processReverseWebhook = async ({ incomingOrderId, awbStr, incoming, courierName, eventTimestamp, shipmentId, token }) => {
  const refs = [
    ...(incomingOrderId ? [{ request_number: String(incomingOrderId) }, { 'pickup.shiprocket_order_id': String(incomingOrderId) }] : []),
    ...(awbStr ? [{ 'pickup.shiprocket_awb': awbStr }, { 'pickup.tracking_number': awbStr }] : []),
    ...(shipmentId ? [{ 'pickup.shiprocket_shipment_id': String(shipmentId) }] : []),
  ];
  if (!refs.length) return null;
  const request = await ReturnRequest.findOne({ $or: refs });
  if (!request) return null;
  if (!validReturnWebhookToken(token)) throw StatusError.forbidden('Invalid return webhook token');
  return { request: await applyReverseEvent({ request, raw: incoming, at: eventTimestamp, awb: awbStr, courier: courierName }) };
};

/**
 * Shiprocket webhook -> update order status + save scans
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const body = req.body || {};

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
    const incomingOrderId = order_id || channel_order_id || null;

    if (!incomingOrderId && !awbStr && !body.shipment_id) {
      // Nothing to correlate — respond 200 so webhook doesn't block
      return res.status(200).json({
        status: "ok",
        message: "No order identifier (order_id/channel_order_id/awb) provided",
      });
    }

    const incoming = (current_status || shipment_status || "")
      .toString()
      .trim()
      .toLowerCase();
    const eventTimestamp = current_timestamp ? new Date(current_timestamp) : new Date();

    // Reverse shipments are correlated by the return number/Shiprocket id/AWB
    // and update the same customer-visible event log as manual admin actions.
    const reverse = await processReverseWebhook({ incomingOrderId, awbStr, incoming, courierName: courier_name, eventTimestamp, shipmentId: body.shipment_id, token: req.headers["x-api-key"] });
    if (reverse) {
      if (reverse.unsupported) return res.status(422).json({ status: "error", message: "Unsupported reverse shipment status" });
      return res.status(200).json({ status: "success", message: "Return pickup status processed", data: { return_request_id: reverse.request._id, pickup_status: reverse.request.pickup.status } });
    }

    // Multi-package fulfillment: correlate to a specific Package first — by
    // our own composite shiprocket_order_id (e.g. "ORD-010708-P2"), else
    // AWB, else Shiprocket's own shipment id. A pre-feature order shipped
    // under the old single-shipment flow has zero Package docs, so this
    // simply finds nothing and falls through to the untouched legacy path
    // below — that's what keeps historical orders fully backward compatible.
    const pkg = await Package.findOne({
      $or: [
        ...(incomingOrderId ? [{ shiprocket_order_id: String(incomingOrderId) }] : []),
        ...(awbStr ? [{ awb: awbStr }] : []),
        ...(body.shipment_id ? [{ shiprocket_shipment_id: String(body.shipment_id) }] : []),
      ],
    });

    if (pkg) {
      const packageStatus = PACKAGE_STATUS_MAP[normalizeOrderStatus(incoming.replace(/\s+/g, "_"))];

      // Courier is picked manually in the Shiprocket dashboard, so the AWB/
      // courier_name arrive on whichever webhook event happens to carry them
      // first — often "AWB Assigned" or similar, which isn't one of our
      // package statuses. Persist them regardless of whether this event also
      // maps to a status transition, instead of discarding the whole event.
      const metaSet = {};
      if (awbStr && awbStr !== pkg.awb) metaSet.awb = awbStr;
      if (courier_name && courier_name !== pkg.courier_name) metaSet.courier_name = courier_name;
      if (etd && etd !== pkg.etd) metaSet.etd = etd;

      if (!packageStatus) {
        if (Object.keys(metaSet).length) {
          await Package.updateOne({ _id: pkg._id }, { $set: metaSet });
        }
        return res.status(200).json({
          status: "success",
          message: "Shipment metadata updated; no package status change",
          data: { packageId: pkg._id },
        });
      }

      // Idempotent replay guard — a redelivered webhook for a status
      // already recorded in this package's timeline, or a stale/
      // out-of-order event for a status the package has already moved
      // past, is a no-op 200, never a regression or an error that would
      // make Shiprocket retry indefinitely.
      const alreadyApplied = (pkg.timeline || []).some((entry) => entry.status === packageStatus);
      if (alreadyApplied || !isForwardPackageTransition(pkg.status, packageStatus)) {
        if (Object.keys(metaSet).length) {
          await Package.updateOne({ _id: pkg._id }, { $set: metaSet });
        }
        return res.status(200).json({
          status: "success",
          message: "Already processed (idempotent)",
          data: { packageId: pkg._id, mapped_status: packageStatus },
        });
      }

      const set = { status: packageStatus, ...metaSet };
      if (packageStatus === "shipped" && !pkg.shipped_at) set.shipped_at = eventTimestamp;
      if (packageStatus === "delivered" && !pkg.delivered_at) set.delivered_at = eventTimestamp;

      const updatedPackage = await Package.findOneAndUpdate(
        { _id: pkg._id },
        { $set: set, $push: { timeline: { status: packageStatus, occurred_at: eventTimestamp, raw: body } } },
        { new: true },
      );

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

      const { order: recomputedOrder, statusChanged } = await orderService.recomputeOrderStatus({
        orderId: pkg.order_id,
        source: "carrier",
      });

      const shipmentEvent = SHIPMENT_STATUS_EVENTS[recomputedOrder.order_status];
      if (statusChanged && shipmentEvent) {
        notificationService.sendOrderNotification({
          order: recomputedOrder,
          event: shipmentEvent,
          dedupeKey: `${recomputedOrder.id}:${shipmentEvent}`,
        });
      }

      return res.status(200).json({
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
    // Everything below is completely unchanged.
    // Try find forward order
    let order = await Order.findOne({ id: incomingOrderId });

    if (!order) {
      // Not found: log and return success (to avoid retries). You can persist webhook for later if you want.
      console.warn("Shiprocket webhook: order not found for", {
        incomingOrderId,
        awb: awbStr,
      });
      return res.status(200).json({
        status: "ok",
        message: "Order not found locally; webhook received",
        incomingOrderId,
        awb: awbStr,
      });
    }
    const newStatus = normalizeOrderStatus(incoming.replace(/\s+/g, "_"));
    if (!newStatus) {
      return res.status(422).json({ status: "error", message: "Unsupported shipment status" });
    }
    // Historical orders may predate the free-form carrier metadata object.
    // Initialize it before recording AWB/courier details so a valid webhook
    // can never fail solely because the order has no prior carrier metadata.
    order.meta = order.meta || {};

    // const event = {
    //   // provider: "shiprocket",
    //   awb: awbStr,
    //   courier_name: courier_name || null,
    //   // channel: channel || null,
    //   // channel_order_id: channel_order_id || null,
    //   // shiprocket_order_id: order_id || null,
    //   // incoming_status: current_status || shipment_status || null,
    //   // incoming_status_id: current_status_id || shipment_status_id || null,
    //   // mapped_status: newStatus,
    //   // timestamp: eventTimestamp,
    //   // raw: body,
    // };

    // --- Deduplicate event: check last N events for same incoming_status + timestamp + awb
    // order.meta = order.meta || {};
    // order.meta.shiprocket_events = order.meta.shiprocket_events || [];
    // const lastEvents = order.meta.shiprocket_events;

    // const isDuplicateEvent = lastEvents.some((e) => {
    //   const sameAwb = (e.awb || null) && awbStr && String(e.awb) === awbStr;
    //   const sameStatus = (e.incoming_status || "").toString().toUpperCase() === (current_status || shipment_status || "").toString().toUpperCase();
    //   const sameTs =
    //     e.timestamp &&
    //     eventTimestamp &&
    //     Math.abs(new Date(e.timestamp).getTime() - new Date(eventTimestamp).getTime()) < 1500; // within 1.5s
    //   return sameStatus && (sameAwb || !awbStr) && sameTs;
    // });

    // if (!isDuplicateEvent) {
    //   order.meta.shiprocket_events.push(event);
    // }

    // Update last AWB / courier meta
    if (awbStr) {
      order.meta.last_awb = awbStr;
      // keep an array of awbs if you like
      order.meta.awbs = order.meta.awbs || [];
      if (!order.meta.awbs.includes(awbStr)) order.meta.awbs.push(awbStr);
    }
    if (courier_name) order.meta.last_courier = courier_name;

    // Update order status if mapped, and set delivered timestamp if relevant
    if (newStatus) {
      const currentOrderStatus = (order.order_status || order.status || "")
        .toString()
        .toLowerCase();
      if (currentOrderStatus !== newStatus) {
        // Stamp the timestamp for the stage the order just entered
        if (newStatus === "processing") {
          order.processing_at = eventTimestamp;
        } else if (newStatus === "shipped") {
          order.shipped_at = eventTimestamp;
        } else if (newStatus === "delivered") {
          order.delivered_at = eventTimestamp;
        }
      }
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

    // Save the updated order (meta + status)
    await order.save();
    // Partial COD: the advance was already collected online; delivery is
    // when the courier collects the remaining COD balance, so that's the
    // moment the order actually becomes fully paid.
    const completesPartialCod =
      newStatus === ORDER_STATUS.DELIVERED &&
      order.payment_method === "cod" &&
      order.payment_status === PAYMENT_STATUS.ADVANCE_PAID;
    order = await orderService.transitionOrder({
      orderId: order._id,
      orderStatus: newStatus,
      paymentStatus: completesPartialCod ? PAYMENT_STATUS.PAID : undefined,
      source: "carrier",
    });

    const shipmentEvent = SHIPMENT_STATUS_EVENTS[newStatus];
    if (shipmentEvent) {
      notificationService
        .sendOrderNotification({
          order,
          event: shipmentEvent,
          dedupeKey: `${order.id}:${shipmentEvent}`,
        });
    }

    // Respond 200 (Shiprocket expects success).
    return res.status(200).json({
      status: "success",
      message: "Order status processed",
      data: {
        orderId: order._id || order.id,
        mapped_status: newStatus,
        recordedEvents: "added",
      },
    });
  } catch (err) {
    // Return a retryable failure. A 200 here would silently discard a carrier
    // transition that never reached the order state machine.
    console.error("Shiprocket webhook processing error:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to process webhook, logged for review",
      error: err?.message || err,
    });
  }
};
