import Order from "../../../models/Order.js";
import Package from "../../../models/Package.js";
import { StatusError } from "../../../config/index.js";
import { returnApi } from "../../shiprocket/returnShipment.js";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { applyPackageShipment, applyLegacyShipment, selectRemoteShipment, shipmentDetails, fulfillmentBlocked } from "./applyShiprocketShipment.js";
import { recomputeOrderStatus } from "./recomputeOrderStatus.js";
import { applyManualOrderStatusChange } from "../manualOrderStatus.js";

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
export const syncShiprocketStatus = async ({ orderId, adminId, shiprocketOrderId = null, notify = true, verifiedRemote = null, packageIds = null }) => {
  const order = await Order.findOne({ _id: orderId, deleted_at: null });
  if (!order) throw StatusError.notFound("Order not found");

  const packages = await Package.find({ order_id: order._id });
  if (packageIds?.some(id => !packages.some(pkg => String(pkg._id) === String(id)))) {
    throw StatusError.badRequest("A selected package does not belong to this order");
  }
  const activePackages = packages.filter(pkg =>
    (!packageIds?.length || packageIds.map(String).includes(String(pkg._id))) &&
    (!shiprocketOrderId || String(pkg.shiprocket_order_id) === String(shiprocketOrderId))
  );
  const blocked = fulfillmentBlocked(order);

  const { notificationService } = await import("../../index.js");
  if (!notify) {
    await Order.updateOne({ _id: order._id }, { $push: { manual_status_history: {
      from: order.order_status, to: order.order_status,
      reason: "Admin CSV import: live Shiprocket shipment details sync requested",
      changed_by: adminId, changed_at: new Date(),
    } } });
  }

  if (packages.length) {
    const results = [];
    for (const pkg of activePackages) {
      const identity = { package_id: pkg._id, package_number: pkg.package_number, reference_id: pkg.reference_id };
      if (!pkg.shiprocket_order_id) {
        results.push({ ...identity, status: pkg.status, changed: false, outcome: "unlinked", message: "Not linked to Shiprocket; use Manage Packages" });
        continue;
      }
      try {
        // Use request start time so a webhook received during the fetch wins.
        const at = new Date();
        if (verifiedRemote && String(verifiedRemote.id) !== String(pkg.shiprocket_order_id)) {
          throw new Error("Verified Shiprocket snapshot does not belong to this package");
        }
        const remote = verifiedRemote || (await returnApi("GET", `orders/show/${encodeURIComponent(pkg.shiprocket_order_id)}`)).data;
        const shipment = selectRemoteShipment(remote, pkg);
        const latestOrder = await Order.findOne({ _id: order._id, deleted_at: null });
        if (!latestOrder) throw new Error("Order no longer exists");
        const result = await applyPackageShipment({
          pkg, shipment: { ...shipment, current_status: shipment.current_status || remote.status }, at,
          allowTransition: !fulfillmentBlocked(latestOrder),
          raw: { source: "manual_admin_sync", changed_by: String(adminId), shiprocket_status: shipment.current_status },
        });
        results.push({ ...identity, status: result.pkg.status, changed: result.changed,
          outcome: result.outcome, details: shipmentDetails(remote, shipment) });
      } catch (error) {
        results.push({ ...identity, status: pkg.status, changed: false, outcome: "error", error: error.message || "Could not sync this package" });
      }
    }
    let recomputed = order;
    let statusChanged = false;
    let reconciliationError;
    if (!blocked) {
      try {
        ({ order: recomputed, statusChanged } = await recomputeOrderStatus({ orderId: order._id, source: "carrier" }));
      } catch (error) {
        reconciliationError = "Package results saved, but order status could not be reconciled. Retry sync.";
      }
    }
    const shipmentEvent = SHIPMENT_STATUS_EVENTS[recomputed.order_status];
    if (notify && statusChanged && shipmentEvent) {
      notificationService.sendOrderNotification({ order: recomputed, event: shipmentEvent, dedupeKey: `${recomputed.id}:${shipmentEvent}` });
    }
    return { order: recomputed, changed: statusChanged || results.some(r => r.changed), results, reconciliation_error: reconciliationError };
  }

  // ── Legacy pre-Package-model order ──
  if (!order.shiprocket_order_id) {
    throw StatusError.badRequest('This order has no Shiprocket link yet — use "Link Shiprocket order" instead.');
  }
  const fetchedAt = new Date();
  let remote;
  try {
    remote = verifiedRemote || (await returnApi("GET", `orders/show/${encodeURIComponent(order.shiprocket_order_id)}`)).data;
  } catch (error) {
    throw StatusError.badRequest("Could not reach Shiprocket for this order. Try again shortly.");
  }
  const shipment = selectRemoteShipment(remote, order);
  const details = shipmentDetails(remote, shipment);

  // Retain the explicit historical import correction path, which separately
  // verifies delivery and permits imported payment records.
  if (!notify && verifiedRemote && normalizeOrderStatus(shipment.current_status || remote.status) === "delivered" && order.order_status !== "delivered" && !blocked) {
    await applyManualOrderStatusChange({ order, status: "delivered", changedBy: adminId,
      historicalDeliveryVerified: true, reason: "Verified historical Shiprocket delivery" });
    Object.assign(order, { order_status: "delivered" });
  }
  const result = await applyLegacyShipment({ order, shipment: { ...shipment, current_status: shipment.current_status || remote.status }, at: fetchedAt });
  const shipmentEvent = SHIPMENT_STATUS_EVENTS[result.order.order_status];
  if (notify && result.statusChanged && shipmentEvent) {
    notificationService.sendOrderNotification({ order: result.order, event: shipmentEvent, dedupeKey: `${result.order.id}:${shipmentEvent}` });
  }
  return { ...result, results: [], details };
};
