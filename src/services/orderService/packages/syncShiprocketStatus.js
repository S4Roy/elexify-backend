import { shiprocketStatusFields } from "../../../helpers/order/shiprocketStatus.js";
import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import { StatusError } from "../../../config/index.js";
import { returnApi } from "../../shiprocket/returnShipment.js";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { PACKAGE_STATUS_MAP, isForwardPackageTransition } from "../../../helpers/order/packageStatus.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { applyManualOrderStatusChange, STATUS_RANK } from "../manualOrderStatus.js";

// Same exclusion list manualOrderStatus.js uses for its own package
// cascade — an active return or a cancelled package isn't this action's
// concern, it belongs to its own dedicated workflow.
const ACTIVE_PACKAGE_EXCLUDED_STATUSES = ["cancelled", "return_requested", "returned"];

const SHIPMENT_STATUS_EVENTS = {
  shipped: "ORDER_SHIPPED",
  out_for_delivery: "ORDER_OUT_FOR_DELIVERY",
  delivered: "ORDER_DELIVERED",
};

/**
 * "Fetch current status" button on Order Details: for an order that's
 * *already* linked to Shiprocket (has one or more Package docs with a
 * shiprocket_order_id, or — for a pre-Package-model order — the legacy
 * Order.shiprocket_order_id field), live-fetches each linked shipment and
 * applies whatever forward progress Shiprocket now shows, exactly what
 * the webhook would have done had it not been missed/delayed/failed.
 *
 * Deliberately does NOT create a new link — an order with nothing linked
 * yet gets a clear error pointing at registerExternalPackage.js instead,
 * since only that live-verified flow may establish a *new* Shiprocket
 * link. This is a resync of an existing one, nothing more.
 */
export const syncShiprocketStatus = async ({ orderId, adminId, shiprocketOrderId = null, notify = true, verifiedRemote = null }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  if (["cancelled", "returned", "return_requested", "failed"].includes(order.order_status) || order.inventory_reverted || (order.refund?.status && order.refund.status !== "not_required")) {
    throw StatusError.conflict("Order has cancellation, return, failure or refund effects.");
  }
  const activePackages = await Package.find({
    order_id: order._id,
    status: { $nin: ACTIVE_PACKAGE_EXCLUDED_STATUSES },
    shiprocket_order_id: shiprocketOrderId || { $type: "string" },
  });

  const { notificationService } = await import("../../index.js");
  if (!notify) {
    await Order.updateOne({ _id: order._id }, { $push: { manual_status_history: {
      from: order.order_status, to: order.order_status,
      reason: "Admin CSV import: live Shiprocket shipment details sync requested",
      changed_by: adminId, changed_at: new Date(),
    } } });
  }

  if (activePackages.length) {
    const results = [];
    for (const pkg of activePackages) {
      let remote;
      try {
        remote = verifiedRemote || (await returnApi("GET", `orders/show/${encodeURIComponent(pkg.shiprocket_order_id)}`)).data;
      } catch (error) {
        results.push({ package_id: pkg._id, changed: false, error: "Could not reach Shiprocket for this package" });
        continue;
      }
      const shipment = Array.isArray(remote?.shipments) ? remote.shipments[0] : remote?.shipments;
      if (!shipment) {
        results.push({ package_id: pkg._id, changed: false, error: "Shiprocket has no shipment on this order" });
        continue;
      }

      const metaSet = shiprocketStatusFields(shipment.current_status || remote.status, new Date(), pkg);
      if (shipment.id && String(shipment.id) !== pkg.shiprocket_shipment_id) metaSet.shiprocket_shipment_id = String(shipment.id);
      if (shipment.awb && shipment.awb !== pkg.awb) metaSet.awb = shipment.awb;
      if (shipment.courier_name && shipment.courier_name !== pkg.courier_name) metaSet.courier_name = shipment.courier_name;
      if (shipment.etd && shipment.etd !== pkg.etd) metaSet.etd = shipment.etd;

      const packageStatus = PACKAGE_STATUS_MAP[normalizeOrderStatus(shipment.current_status || remote.status)];
      const isForward = packageStatus && isForwardPackageTransition(pkg.status, packageStatus);

      if (!isForward) {
        if (Object.keys(metaSet).length) await Package.updateOne({ _id: pkg._id }, { $set: metaSet });
        results.push({ package_id: pkg._id, status: pkg.status, changed: Object.keys(metaSet).length > 0 });
        continue;
      }

      const now = new Date();
      const set = { status: packageStatus, ...metaSet };
      if (packageStatus === "shipped" && !pkg.shipped_at) set.shipped_at = now;
      if (packageStatus === "delivered" && !pkg.delivered_at) set.delivered_at = now;
      await Package.updateOne(
        { _id: pkg._id },
        { $set: set, $push: { timeline: {
          status: packageStatus, occurred_at: now,
          raw: { source: "manual_admin_sync", changed_by: String(adminId), shiprocket_status: shipment.current_status },
        } } },
      );
      results.push({ package_id: pkg._id, status: packageStatus, changed: true });
    }

    const { order: recomputed, statusChanged } = await recomputeOrderStatus({ orderId: order._id, source: "application" });
    const shipmentEvent = SHIPMENT_STATUS_EVENTS[recomputed.order_status];
    if (notify && statusChanged && shipmentEvent) {
      notificationService.sendOrderNotification({
        order: recomputed, event: shipmentEvent, dedupeKey: `${recomputed.id}:${shipmentEvent}`,
      });
    }
    return { order: recomputed, changed: statusChanged || results.some((r) => r.changed), results };
  }

  // ── Legacy pre-Package-model order ──
  if (!order.shiprocket_order_id) {
    throw StatusError.badRequest('This order has no Shiprocket link yet — use "Link Shiprocket order" instead.');
  }
  let remote;
  try {
    remote = verifiedRemote || (await returnApi("GET", `orders/show/${encodeURIComponent(order.shiprocket_order_id)}`)).data;
  } catch (error) {
    throw StatusError.badRequest("Could not reach Shiprocket for this order. Try again shortly.");
  }
  const shipment = Array.isArray(remote?.shipments) ? remote.shipments[0] : remote?.shipments;

  const metaUpdates = shiprocketStatusFields(shipment?.current_status || remote?.status, new Date(), order);
  if (shipment?.awb && shipment.awb !== order.awb) metaUpdates.awb = shipment.awb;
  if (shipment?.courier_name && shipment.courier_name !== order.courier_name) metaUpdates.courier_name = shipment.courier_name;
  if (shipment?.etd && shipment.etd !== order.etd) metaUpdates.etd = shipment.etd;

  const mappedStatus = normalizeOrderStatus(shipment?.current_status || remote?.status);
  const currentRank = STATUS_RANK[order.order_status] ?? -1;
  const targetRank = STATUS_RANK[mappedStatus] ?? -1;
  const isForward = mappedStatus && targetRank > currentRank;

  if (!isForward) {
    if (Object.keys(metaUpdates).length) await Order.updateOne({ _id: order._id }, { $set: metaUpdates });
    Object.assign(order, metaUpdates);
    return { order, changed: Object.keys(metaUpdates).length > 0, results: [] };
  }

  const updated = await applyManualOrderStatusChange({
    order, status: mappedStatus, changedBy: adminId,
    historicalDeliveryVerified: !notify && !!verifiedRemote && mappedStatus === "delivered",
    reason: `Synced from Shiprocket (live status: "${shipment?.current_status || "unknown"}")`,
  });
  if (Object.keys(metaUpdates).length) await Order.updateOne({ _id: order._id }, { $set: metaUpdates });

  const shipmentEvent = SHIPMENT_STATUS_EVENTS[updated.order_status];
  if (notify && shipmentEvent) {
    notificationService.sendOrderNotification({
      order: updated, event: shipmentEvent, dedupeKey: `${updated.id}:${shipmentEvent}`,
    });
  }
  Object.assign(updated, metaUpdates);
  return { order: updated, changed: true, results: [] };
};
