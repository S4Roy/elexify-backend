import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Package from "../../../models/Package.js";
import { transitionOrder } from "../transitionOrder.js";
import { derivePackageOrderStatus, summarizePackageQuantities } from "../derivePackageOrderStatus.js";

// Recomputes the order's aggregate order_status from its Package docs (see
// derivePackageOrderStatus.js) and persists it through the existing
// transitionOrder funnel — reused as-is, so optimistic concurrency,
// notifications-on-replacement, everything stays intact. Also refreshes
// the package_count/fully_packed denormalized counters. Called after any
// package ship/webhook-update; safe to call even when nothing changed
// (transitionOrder treats from===to as a no-op success).
//
// Returns { order, statusChanged } so callers can decide whether to fire a
// customer notification for this specific transition.
export const recomputeOrderStatus = async ({ orderId, source = "application", session = null } = {}) => {
  const orderItemsQuery = OrderItem.find({ order_id: orderId });
  const packagesQuery = Package.find({ order_id: orderId });
  if (session) {
    orderItemsQuery.session(session);
    packagesQuery.session(session);
  }
  const [orderItems, packages] = await Promise.all([orderItemsQuery, packagesQuery]);

  const nonCancelledPackages = packages.filter((pkg) => pkg.status !== "cancelled");
  const { items } = summarizePackageQuantities(orderItems, nonCancelledPackages);
  const fullyPacked =
    orderItems.length > 0 &&
    items.every((item) => item.allocated_qty >= item.ordered_qty);

  const orderQuery = Order.findById(orderId);
  if (session) orderQuery.session(session);
  const order = await orderQuery;
  const set = { package_count: nonCancelledPackages.length, fully_packed: fullyPacked };
  if (!order.zoho?.packed_at && packages.some(pkg => pkg.status === "packed")) {
    set["zoho.packed_at"] = new Date();
  }

  const derived = derivePackageOrderStatus(items);
  if (derived && derived !== order.order_status) {
    if (derived === "shipped" && !order.shipped_at) set.shipped_at = new Date();
    if (derived === "delivered" && !order.delivered_at) set.delivered_at = new Date();
    const updated = await transitionOrder({ orderId, orderStatus: derived, set, session, source });
    return { order: updated, statusChanged: true, previousStatus: order.order_status };
  }

  const updateQuery = Order.updateOne({ _id: orderId }, { $set: set, ...(order.zoho?.packed_at || set["zoho.packed_at"] ? { $inc: { "zoho.version": 1 } } : {}) });
  if (session) updateQuery.session(session);
  await updateQuery;
  const refreshedQuery = Order.findById(orderId);
  if (session) refreshedQuery.session(session);
  const refreshed = await refreshedQuery;
  return { order: refreshed, statusChanged: false, previousStatus: order.order_status };
};
