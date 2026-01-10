import Order from "../../../models/Order.js";
import OrderScans from "../../../models/OrderScans.js";
import moment from "moment-timezone";

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

    if (!incomingOrderId && !awbStr) {
      // Nothing to correlate — respond 200 so webhook doesn't block
      return res.status(200).json({
        status: "ok",
        message: "No order identifier (order_id/channel_order_id/awb) provided",
      });
    }

    // Try find order
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
    const incoming = (current_status || shipment_status || "")
      .toString()
      .trim()
      .toLowerCase();

    const newStatus = incoming;

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
        if ("order_status" in order) order.order_status = newStatus;
        else order.status = newStatus;

        // If delivered, note delivered_at
        if (newStatus === "delivered") {
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
    // Log and respond 200 to avoid webhook retries, or 500 if you want retries
    console.error("Shiprocket webhook processing error:", err);
    // return 200 to acknowledge receipt so Shiprocket won't keep retrying
    return res.status(200).json({
      status: "error",
      message: "Failed to process webhook, logged for review",
      error: err?.message || err,
    });
  }
};
