import { ORDER_STATUS_VALUES } from "../../constants/orderStatus.js";

const EXTERNAL_STATUS_MAP = {
  // WooCommerce "processing" = paid, awaiting fulfilment — our "confirmed".
  // Internal "processing" (merchant is preparing it) is only ever set by an
  // admin action, never inferred from an external system.
  processing: "confirmed",
  completed: "delivered",
  "on-hold": "confirmed",
  "checkout-draft": "pending",
  refunded: "returned",
  in_transit: "shipped",
  "in-transit": "shipped",
  out_for_delivery: "out_for_delivery",
  "out-for-delivery": "out_for_delivery",
  picked_up: "shipped",
  pickup_scheduled: "packed",

  // Shiprocket's remaining "Forward Order Status" vocabulary (support.
  // shiprocket.in/.../important-terms-all-shiprocket-users-should-know) —
  // still pre-pickup (courier assigned but not yet collected) maps to our
  // existing "packed"; still-in-transit variants map to "shipped". NDR
  // (Undelivered/Escalation), RTO, Lost/Damaged/Destroyed, and pickup
  // error/exception are deliberately left unmapped — those are exception
  // outcomes, not forward progress, and need their own handling rather
  // than being silently folded into a forward status.
  pickup_rescheduled: "packed",
  out_for_pickup: "packed",
  "reached-at-destination_hub": "shipped",
  reached_at_destination_hub: "shipped",
  delayed: "shipped",
  misrouted: "shipped",
  canceled: "cancelled",
};

export const normalizeOrderStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = EXTERNAL_STATUS_MAP[normalized] || normalized;
  return ORDER_STATUS_VALUES.includes(mapped) ? mapped : null;
};
