// Canonical order/payment status vocabulary. These are NOT enforced as a
// Mongoose schema enum on Order.order_status/payment_status — the Shiprocket
// delivery webhook (src/controllers/site/webhook/updateOrderStatus.js) writes
// arbitrary free-text carrier statuses into order_status, and a hard enum
// would break that integration. Instead, this module is the single source of
// truth used by validation schemas and the cancellation service.

export const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PROCESSING: "processing",
  PACKED: "packed",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCEL_REQUESTED: "cancel_requested",
  CANCELLED: "cancelled",
  RETURN_REQUESTED: "return_requested",
  RETURNED: "returned",
  FAILED: "failed",
};

export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUND_PENDING: "refund_pending",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
  REFUND_FAILED: "refund_failed",
};
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

export const PAYMENT_METHOD = { COD: "cod", RAZORPAY: "razorpay", PAYPAL: "paypal" };
export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

const ALLOWED_TRANSITIONS = {
  pending: ["confirmed", "processing", "cancelled", "failed"],
  confirmed: ["processing", "packed", "cancelled"],
  processing: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["return_requested"],
  return_requested: ["returned"],
};

export const canTransitionOrder = (from, to) =>
  from === to || Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));

// Orders in these order_status values may be cancelled unconditionally.
export const CANCELLABLE_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
];

// "packed" is only cancellable if the shipment hasn't been handed to a
// courier yet — none of these three fields should be populated.
export const isPackedOrderCancellable = (order) =>
  !order.awb && !order.shiprocket_order_id && !order.courier_name;

export const isOrderCancellable = (order) => {
  if (CANCELLABLE_ORDER_STATUSES.includes(order.order_status)) return true;
  if (order.order_status === ORDER_STATUS.PACKED) {
    return isPackedOrderCancellable(order);
  }
  return false;
};

export const CANCELLATION_REASONS = [
  "Ordered by mistake",
  "Changed my mind",
  "Found a better price",
  "Delivery taking too long",
  "Incorrect address",
  "Need to change product/quantity",
  "Other",
];

// An invoice becomes available once the order has actually been
// confirmed/accepted — not gated on "delivered". Explicitly excludes
// pending (not yet confirmed), cancel_requested/cancelled, and
// return_requested/returned.
export const INVOICE_ELIGIBLE_STATUSES = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.PACKED,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

// Single source of truth for invoice-button visibility (frontend) and
// invoice-generation eligibility (backend, the real enforcer). Once an
// invoice has actually been issued it stays eligible forever — even if the
// order is later cancelled/returned — so an already-issued invoice is never
// silently hidden or invalidated by a later status change.
export const canGenerateInvoice = (order) =>
  order?.invoice?.generated === true ||
  INVOICE_ELIGIBLE_STATUSES.includes(order?.order_status);
