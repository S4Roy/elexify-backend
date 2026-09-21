import Package from "../../../models/Package.js";
import { shiprocketStatusFields } from "../../../helpers/order/shiprocketStatus.js";
import { normalizeOrderStatus } from "../../../helpers/order/normalizeOrderStatus.js";
import { PACKAGE_STATUS_MAP, isForwardPackageTransition } from "../../../helpers/order/packageStatus.js";

const text = value => value == null ? null : String(value).trim() || null;

// A provider order can contain historical/rebooked shipments. Never select the
// first shipment when several exist, or silently replace a known shipment ID.
export const selectRemoteShipment = (remote, current = {}) => {
  if (remote?.id != null && current.shiprocket_order_id && String(remote.id) !== String(current.shiprocket_order_id)) {
    throw new Error("Shiprocket returned a different order; review the package link");
  }
  const shipments = (Array.isArray(remote?.shipments) ? remote.shipments : [remote?.shipments]).filter(Boolean);
  if (!shipments.length) throw new Error("Shiprocket has no shipment on this order");
  if (current.shiprocket_shipment_id) {
    const matches = shipments.filter(s => text(s.id) === String(current.shiprocket_shipment_id));
    if (matches.length === 1) return matches[0];
    throw new Error("Linked shipment was not uniquely found; review the package link");
  }
  if (current.awb) {
    const matches = shipments.filter(s => text(s.awb) === String(current.awb));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error("Multiple shipments match this AWB");
  }
  if (shipments.length === 1) return shipments[0];
  throw new Error("Multiple shipments found without an exact match; review the package link");
};

export const shipmentDetails = (remote, shipment) => ({
  shiprocket_order_id: text(remote?.id), channel_order_id: text(remote?.channel_order_id),
  channel_name: text(remote?.channel_name), status: text(shipment?.current_status || remote?.status),
  shipment_id: text(shipment?.id), awb: text(shipment?.awb),
  courier_name: text(shipment?.courier_name), etd: text(shipment?.etd),
});

export const shipmentMetadata = (current, shipment, at) => {
  if (current.shiprocket_status_updated_at && new Date(current.shiprocket_status_updated_at) > at) return {};
  const set = shiprocketStatusFields(shipment.current_status, at, current);
  // Also guard timestamp-less metadata updates against concurrent writes.
  set.shiprocket_status_updated_at = at;
  for (const [key, value] of Object.entries({
    shiprocket_shipment_id: shipment.id, awb: shipment.awb,
    courier_name: shipment.courier_name, etd: shipment.etd,
  })) {
    const normalized = text(value);
    if (normalized && normalized !== current[key]) set[key] = normalized;
  }
  return set;
};

export const fulfillmentBlocked = order => !!order && (
  ["cancel_requested", "cancelled", "returned", "return_requested", "failed"].includes(order.order_status)
  || order.inventory_reverted || (order.refund?.status && order.refund.status !== "not_required")
);

// Shared by manual fetch and webhook. Compare-and-swap protects status AND
// tracking metadata; retry with fresh state if another event wins the race.
export const applyPackageShipment = async ({ pkg, shipment, at = new Date(), raw = {}, allowTransition = true }) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!pkg) throw new Error("Package no longer exists");
    if (pkg.shiprocket_status_updated_at && new Date(pkg.shiprocket_status_updated_at) > at) {
      return { pkg, changed: false, outcome: "stale" };
    }
    if (pkg.shiprocket_shipment_id && shipment.id && String(pkg.shiprocket_shipment_id) !== String(shipment.id)) {
      throw new Error("Shipment ID conflicts with the linked package");
    }
    const target = PACKAGE_STATUS_MAP[normalizeOrderStatus(shipment.current_status)];
    const terminal = ["cancelled", "returned", "return_requested"].includes(pkg.status);
    const forward = allowTransition && !terminal && target && isForwardPackageTransition(pkg.status, target)
      && !(pkg.timeline || []).some(entry => entry.status === target);
    const set = shipmentMetadata(pkg, shipment, at);
    // A stale fulfillment snapshot must not replace tracking for a later stage.
    if (target && target !== pkg.status && !isForwardPackageTransition(pkg.status, target)) {
      return { pkg, changed: false, outcome: "stale" };
    }
    const update = { $set: set };
    if (forward) {
      set.status = target;
      for (const [status, key] of [["shipped", "shipped_at"], ["delivered", "delivered_at"], ["cancelled", "cancelled_at"]]) {
        if (target === status && !pkg[key]) set[key] = at;
      }
      update.$push = { timeline: { status: target, occurred_at: at, raw } };
    }
    const updated = await Package.findOneAndUpdate({
      _id: pkg._id, status: pkg.status,
      shiprocket_status_updated_at: pkg.shiprocket_status_updated_at || null,
    }, update, { new: true });
    if (updated) return { pkg: updated, changed: true, outcome: allowTransition ? "synced" : "metadata_only" };
    pkg = await Package.findById(pkg._id);
  }
  throw new Error("Package changed during sync; retry this package");
};

// Legacy orders have no Package documents. Use the same metadata policy and
// the guarded order transition funnel; never cascade one shipment to packages.
export const applyLegacyShipment = async ({ order, shipment, at = new Date() }) => {
  const { default: Order } = await import("../../../models/Order.js");
  const { transitionOrder } = await import("../transitionOrder.js");
  const { canTransitionOrder } = await import("../../../constants/orderStatus.js");
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!order) throw new Error("Order no longer exists");
    if (await Package.exists({ order_id: order._id })) throw new Error("Order now has packages; sync its packages instead");
    if (order.shiprocket_status_updated_at && new Date(order.shiprocket_status_updated_at) > at) {
      return { order, changed: false, statusChanged: false, outcome: "stale" };
    }
    if (order.shiprocket_shipment_id && shipment.id && String(order.shiprocket_shipment_id) !== String(shipment.id)) {
      throw new Error("Shipment ID conflicts with the linked order");
    }
    const mapped = normalizeOrderStatus(shipment.current_status);
    const stages = ["pending", "confirmed", "processing", "packed", "partially_shipped", "shipped", "out_for_delivery", "partially_delivered", "delivered"];
    if (stages.includes(mapped) && stages.indexOf(mapped) < stages.indexOf(order.order_status)) {
      return { order, changed: false, statusChanged: false, outcome: "stale" };
    }
    const blocked = fulfillmentBlocked(order);
    const forward = !blocked && mapped && mapped !== order.order_status && canTransitionOrder(order.order_status, mapped);
    const set = shipmentMetadata(order, shipment, at);
    if (forward) {
      if (mapped === "shipped" && !order.shipped_at) set.shipped_at = at;
      if (mapped === "delivered" && !order.delivered_at) set.delivered_at = at;
    }
    // A delivered COD advance is completed only for an actual delivery,
    // never for returns/refunds or a single package on a split order.
    const paid = !blocked && mapped === "delivered" && (forward || order.order_status === "delivered")
      && order.payment_method === "cod" && order.payment_status === "advance_paid";
    try {
      const updated = await transitionOrder({
        orderId: order._id, orderStatus: forward ? mapped : undefined,
        paymentStatus: paid ? "paid" : undefined, set, source: "carrier",
        expectedState: { order_status: order.order_status, payment_status: order.payment_status,
          shiprocket_status_updated_at: order.shiprocket_status_updated_at || null, package_count: order.package_count || 0 },
      });
      return { order: updated, changed: true, statusChanged: !!forward, outcome: blocked ? "metadata_only" : "synced" };
    } catch (error) {
      if (!error.shipmentConflict || attempt === 2) throw error;
      order = await Order.findById(order._id);
    }
  }
};
