import { ORDER_STATUS_VALUES } from "../../constants/orderStatus.js";

const EXTERNAL_STATUS_MAP = {
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
};

export const normalizeOrderStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = EXTERNAL_STATUS_MAP[normalized] || normalized;
  return ORDER_STATUS_VALUES.includes(mapped) ? mapped : null;
};
