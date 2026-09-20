// A Package only ever carries a shipment-stage status (models/Package.js)
// — never the order-level "confirmed"/"processing"/"partially_*" values
// normalizeOrderStatus can also return for other callers. Shared by the
// Shiprocket webhook (controllers/site/webhook/updateOrderStatus.js),
// registerExternalPackage (admin manual linking), and the
// reconcileShiprocketOrderStatus script so all three agree on what a
// package status transition means.
export const PACKAGE_STATUS_MAP = {
  packed: "packed",
  shipped: "shipped",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
  returned: "returned",
};

// Shiprocket deliveries aren't guaranteed in order (webhook retries,
// out-of-order events, or — for the reconciliation script — a snapshot
// export that's already ahead of whatever we last recorded) — a stale or
// duplicate status for a package that's already moved past it must be a
// no-op, never a regression.
const PACKAGE_STATUS_ORDER = ["packed", "shipped", "out_for_delivery", "delivered"];

export const isForwardPackageTransition = (from, to) => {
  if (to === "returned") return from === "delivered";
  // Shiprocket only ever cancels pre-pickup (same window our own
  // cancelPackage enforces) — a "Cancelled" event against a package that's
  // already shipped/delivered is stale/out-of-order, never a real
  // transition to apply.
  if (to === "cancelled") return ["packed", "failed"].includes(from);
  const fromIdx = PACKAGE_STATUS_ORDER.indexOf(from);
  const toIdx = PACKAGE_STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx > fromIdx;
};
