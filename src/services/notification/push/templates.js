// Deliberately allow only existing mobile destinations; no external URLs/query strings.
export function validRoute(route) {
  return (
    typeof route === "string" &&
    route.length <= 240 &&
    /^(\/notifications|\/orders(?:\/[A-Za-z0-9_-]+)?|\/products(?:\/[A-Za-z0-9_-]+)?|\/account\/security|\/\(tabs\)\/categories)$/.test(
      route
    )
  );
}
const titles = {
  ORDER_PLACED: "Order placed",
  ORDER_CONFIRMED: "Order confirmed",
  ORDER_PROCESSING: "Order processing",
  ORDER_PACKED: "Order packed",
  ORDER_SHIPPED: "Your order has shipped",
  ORDER_OUT_FOR_DELIVERY: "Your order is out for delivery",
  ORDER_DELIVERED: "Order delivered",
  ORDER_CANCELLED: "Order cancelled",
  PAYMENT_SUCCESS: "Payment received",
  PAYMENT_FAILED: "Payment unsuccessful",
  REFUND_INITIATED: "Refund initiated",
  REFUND_COMPLETED: "Refund completed",
  RETURN_REQUESTED: "Return requested",
  RETURN_APPROVED: "Return approved",
  RETURN_REJECTED: "Return update",
  RETURN_RECEIVED: "Return received",
  RETURN_COMPLETED: "Return completed",
  RETURN_UPDATED: "Return update",
  ACCOUNT_LOGIN: "Account sign-in",
  PASSWORD_CHANGED: "Password changed",
  EMAIL_CHANGED: "Email changed",
  MOBILE_CHANGED: "Mobile number changed",
  SUSPICIOUS_ACTIVITY: "Account security alert",
  ACCOUNT_LOCKED: "Account security alert",
};
export const PUSH_TYPES = Object.freeze([
  ...Object.keys(titles),
  "PROMOTIONAL_CAMPAIGN",
  "BACK_IN_STOCK",
  "PRICE_DROP",
  "NEW_PRODUCT",
  "CART_ABANDONED",
  "ACCOUNT_SECURITY",
  "OUT_FOR_DELIVERY",
]);
export function resolvePushTemplate(event, data = {}) {
  if (!titles[event]) return null;
  const orderId = String(data.order_id || "");
  const order = /^[A-Za-z0-9_-]{1,100}$/.test(orderId);
  const entityId = /^[a-f0-9]{24}$/i.test(String(data.order_entity_id || ""))
    ? String(data.order_entity_id)
    : null;
  return {
    type: event,
    title: titles[event],
    body: order
      ? `Open Elexify for the latest update on order ${orderId}.`
      : "Open Elexify to review your account update.",
    route: order
      ? entityId
        ? `/orders/${entityId}`
        : "/orders"
      : "/account/security",
    data: order
      ? { type: event, entityType: "order", entityId: entityId || "" }
      : { type: event, entityType: "account" },
  };
}
