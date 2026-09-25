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
// Body copy per event: says what happened and what (if anything) to do,
// with the order number, instead of a generic "open the app". "{order}" is
// replaced with the customer-facing order number.
const bodies = {
  ORDER_PLACED: "Thanks for shopping with Elexify! Order {order} is placed. We'll keep you posted.",
  ORDER_CONFIRMED: "Good news — order {order} is confirmed and will be prepared for dispatch.",
  ORDER_PROCESSING: "We're preparing order {order} for dispatch.",
  ORDER_PACKED: "Order {order} is packed and will be handed to the courier soon.",
  ORDER_SHIPPED: "Order {order} is on its way. Tap to track your package.",
  ORDER_OUT_FOR_DELIVERY: "Order {order} is out for delivery today. Keep your phone handy.",
  ORDER_DELIVERED: "Order {order} has been delivered. We hope you love it!",
  ORDER_CANCELLED: "Order {order} has been cancelled. Tap to see the details.",
  PAYMENT_SUCCESS: "We've received your payment for order {order}.",
  PAYMENT_FAILED: "Payment for order {order} didn't go through. Tap to try again.",
  REFUND_INITIATED: "Your refund for order {order} has been initiated.",
  REFUND_COMPLETED: "Your refund for order {order} is complete.",
  RETURN_REQUESTED: "We've received your return request for order {order}.",
  RETURN_APPROVED: "Your return for order {order} is approved. Tap for pickup details.",
  RETURN_REJECTED: "There's an update on your return for order {order}. Tap to view.",
  RETURN_RECEIVED: "We've received the returned items from order {order}.",
  RETURN_COMPLETED: "Your return for order {order} is complete.",
  RETURN_UPDATED: "There's an update on your return for order {order}.",
  ACCOUNT_LOGIN: "New sign-in to your Elexify account. Not you? Tap to secure your account.",
  PASSWORD_CHANGED: "Your Elexify password was changed. Not you? Tap to secure your account.",
  EMAIL_CHANGED: "The email on your Elexify account was changed. Not you? Tap to review.",
  MOBILE_CHANGED: "The mobile number on your Elexify account was changed. Not you? Tap to review.",
  SUSPICIOUS_ACTIVITY: "We noticed unusual activity on your account. Tap to review it.",
  ACCOUNT_LOCKED: "Your account was locked for your security. Tap to review.",
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
    body:
      bodies[event] && (order || !bodies[event].includes("{order}"))
        ? bodies[event].replace("{order}", orderId)
        : order
        ? `There's an update on order ${orderId}. Tap to view.`
        : bodies[event]?.includes("{order}")
        ? "There's an update on your order. Tap to view."
        : "There's an update on your Elexify account. Tap to review.",
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
