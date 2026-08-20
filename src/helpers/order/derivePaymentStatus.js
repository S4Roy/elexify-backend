// WooCommerce order statuses (as returned by $order->get_status(), no
// "wc-" prefix) that mean payment has actually been received. Everything
// else — pending, on-hold, cancelled, failed, refunded, checkout-draft —
// maps to "pending" here; refund handling is a separate concern this
// endpoint doesn't own.
const PAID_ORDER_STATUSES = new Set(["processing", "completed"]);

export function derivePaymentStatus(wcStatus) {
  return PAID_ORDER_STATUSES.has(wcStatus) ? "paid" : "pending";
}
