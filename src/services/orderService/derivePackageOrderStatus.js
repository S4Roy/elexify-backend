import { ORDER_STATUS } from "../../constants/orderStatus.js";

// Package statuses that mean the shipment has actually left the warehouse.
const SHIPPED_STATUSES = new Set([
  "shipped",
  "out_for_delivery",
  "delivered",
  "return_requested",
  "returned",
]);
// Package statuses that mean the shipment reached the customer.
const DELIVERED_STATUSES = new Set(["delivered", "return_requested", "returned"]);

/**
 * Computes the order-level aggregate status from per-item packed/shipped/
 * delivered quantity sums (derived from non-cancelled Package docs — see
 * src/models/Package.js). Pure function, no I/O, so it's trivially testable
 * and reusable from both the package-creation service and the Shiprocket
 * webhook handler.
 *
 * Reduces to exactly today's single-package semantics when one package
 * covers 100% of the order: allocated/shipped/delivered all move together,
 * so no partial status ever triggers. Returns null when nothing is packed
 * yet (caller should leave order_status untouched in that case).
 *
 * @param {Array<{ordered_qty:number, allocated_qty:number, shipped_qty:number, delivered_qty:number}>} items
 */
export const derivePackageOrderStatus = (items) => {
  let totalOrdered = 0;
  let totalAllocated = 0;
  let totalShipped = 0;
  let totalDelivered = 0;
  for (const item of items) {
    totalOrdered += Number(item.ordered_qty) || 0;
    totalAllocated += Number(item.allocated_qty) || 0;
    totalShipped += Number(item.shipped_qty) || 0;
    totalDelivered += Number(item.delivered_qty) || 0;
  }

  if (totalOrdered > 0 && totalDelivered >= totalOrdered) return ORDER_STATUS.DELIVERED;
  if (totalDelivered > 0) return ORDER_STATUS.PARTIALLY_DELIVERED;
  if (totalOrdered > 0 && totalShipped >= totalOrdered) return ORDER_STATUS.SHIPPED;
  if (totalShipped > 0) return ORDER_STATUS.PARTIALLY_SHIPPED;
  if (totalAllocated > 0) return ORDER_STATUS.PACKED;
  return null;
};

// Summarizes a list of non-cancelled Package docs (already filtered by the
// caller) plus the order's OrderItems into the per-item shape
// derivePackageOrderStatus expects, and also returns the raw per-item
// packed/shipped quantities the order-detail APIs display as
// Unpacked/Packed/Shipped.
export const summarizePackageQuantities = (orderItems, packages) => {
  const allocatedByItem = new Map();
  const shippedByItem = new Map();
  const deliveredByItem = new Map();

  for (const pkg of packages) {
    if (pkg.status === "cancelled") continue;
    const isShipped = SHIPPED_STATUSES.has(pkg.status);
    const isDelivered = DELIVERED_STATUSES.has(pkg.status);
    for (const line of pkg.items || []) {
      const key = String(line.order_item_id);
      allocatedByItem.set(key, (allocatedByItem.get(key) || 0) + line.quantity);
      if (isShipped) shippedByItem.set(key, (shippedByItem.get(key) || 0) + line.quantity);
      if (isDelivered) deliveredByItem.set(key, (deliveredByItem.get(key) || 0) + line.quantity);
    }
  }

  const items = orderItems.map((item) => {
    const key = String(item._id);
    return {
      order_item_id: item._id,
      ordered_qty: item.quantity,
      allocated_qty: allocatedByItem.get(key) || 0,
      shipped_qty: shippedByItem.get(key) || 0,
      delivered_qty: deliveredByItem.get(key) || 0,
    };
  });

  return { items, allocatedByItem };
};
