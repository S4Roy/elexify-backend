// Stock management vocabulary shared by models, services/stock, validators
// and the admin API. Keep the admin panel's reason select in sync with
// STOCK_ADJUSTMENT_REASONS.

export const STOCK_STATUS = Object.freeze({
  IN_STOCK: "in_stock",
  OUT_OF_STOCK: "out_of_stock",
  ON_BACKORDER: "on_backorder",
});
export const STOCK_STATUSES = Object.values(STOCK_STATUS);

// Ledger row types. "in" / "out" / "return" / "adjustment" are legacy and
// kept so historical rows still validate.
export const STOCK_TRANSACTION_TYPES = [
  "in",
  "out",
  "sale",
  "return",
  "adjustment",
  "restock",
  "opening_balance",
];

export const STOCK_REFERENCE_TYPES = [
  "order",
  "purchase",
  "manual",
  "return",
  "adjustment",
  "import",
  "opening_balance",
  "rto",
  "replacement",
];

export const STOCK_REASON = Object.freeze({
  RECEIVED: "received",
  COUNT_CORRECTION: "count_correction",
  DAMAGE: "damage",
  LOSS: "loss",
  THEFT: "theft",
  EXPIRED: "expired",
  INTERNAL_USE: "internal_use",
  RETURNED_TO_VENDOR: "returned_to_vendor",
  RTO_RESTOCK: "rto_restock",
  CUSTOMER_RETURN: "customer_return",
  ORDER_CANCEL: "order_cancel",
  ORDER_SALE: "order_sale",
  OPENING_BALANCE: "opening_balance",
  OTHER: "other",
});
export const STOCK_REASONS = Object.values(STOCK_REASON);

// Reasons an admin may pick for a manual adjustment.
export const STOCK_ADJUSTMENT_REASONS = [
  STOCK_REASON.RECEIVED,
  STOCK_REASON.COUNT_CORRECTION,
  STOCK_REASON.DAMAGE,
  STOCK_REASON.LOSS,
  STOCK_REASON.THEFT,
  STOCK_REASON.EXPIRED,
  STOCK_REASON.INTERNAL_USE,
  STOCK_REASON.RETURNED_TO_VENDOR,
  STOCK_REASON.OTHER,
];

export const STOCK_ACTOR_TYPES = ["admin", "customer", "system"];

// Order.stock_state lifecycle:
//   none → reserved → committed → restocked
//               ↘ released
//   none → committed (COD / replacement / reopen / late capture)
export const ORDER_STOCK_STATE = Object.freeze({
  NONE: "none",
  RESERVED: "reserved",
  COMMITTED: "committed",
  RELEASED: "released",
  RESTOCKED: "restocked",
});
export const ORDER_STOCK_STATES = Object.values(ORDER_STOCK_STATE);

export const ORDER_STOCK_FLAG = Object.freeze({
  LATE_CAPTURE_OOS: "late_capture_oos",
  // Payment captured after the customer/admin had already cancelled.
  CAPTURE_AFTER_CANCEL: "capture_after_cancel",
});
// Flags meaning "payment recorded against a cancelled order and refunded".
export const REFUNDED_CAPTURE_FLAGS = [ORDER_STOCK_FLAG.LATE_CAPTURE_OOS, ORDER_STOCK_FLAG.CAPTURE_AFTER_CANCEL];

export const RESERVATION_STATUS = Object.freeze({
  ACTIVE: "active",
  COMMITTED: "committed",
  RELEASED: "released",
});

export const DEFAULT_RESERVATION_TTL_MINUTES = 20;
export const RESERVATION_TTL_SETTING_SLUG = "stock_reservation_ttl_minutes";
