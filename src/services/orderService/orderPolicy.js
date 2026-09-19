import ShippingSettings from "../../models/ShippingSettings.js";
import { FORCE_CANCELLABLE_ORDER_STATUSES, isPackedOrderCancellable, ORDER_STATUS } from "../../constants/orderStatus.js";

export const getCancellationEligibility = (order, actorType, policy, { force = false } = {}) => {
  const isCustomer = actorType === "customer";
  const enabled = isCustomer
    ? policy.customer_cancellation_enabled
    : policy.admin_cancellation_enabled;

  if (!enabled) return { allowed: false, reason: "Cancellation is disabled by policy." };

  // Force-cancel (admin-only, superadmin-gated at the route level) ignores
  // the configured admin_cancellation_statuses list and the packed-order
  // courier check, but is still capped at FORCE_CANCELLABLE_ORDER_STATUSES —
  // see its definition for why shipped+ orders are excluded even here.
  if (force && !isCustomer) {
    if (!FORCE_CANCELLABLE_ORDER_STATUSES.includes(order?.order_status)) {
      return {
        allowed: false,
        reason: "This order's status can no longer be force-cancelled — once a shipment has left, use the return workflow instead.",
      };
    }
    return { allowed: true, reason: null };
  }

  const allowedStatuses = isCustomer
    ? policy.customer_cancellation_statuses
    : policy.admin_cancellation_statuses;

  if (!allowedStatuses.includes(order?.order_status)) {
    return { allowed: false, reason: "The current order status is not eligible for cancellation." };
  }
  if (order.order_status === ORDER_STATUS.PACKED) {
    if (isCustomer && !policy.customer_cancel_packed_before_dispatch) {
      return { allowed: false, reason: "Customer cancellation is not available after packing." };
    }
    if (!isPackedOrderCancellable(order)) {
      return { allowed: false, reason: "The shipment has already been handed to the courier." };
    }
  }
  return { allowed: true, reason: null };
};

export const getOrderPolicy = () => ShippingSettings.getSingleton();

export const getCustomerOrderCapabilities = (order, policy) => {
  const deliveredAt = order?.delivered_at ? new Date(order.delivered_at) : null;
  const deadline = deliveredAt
    ? new Date(deliveredAt.getTime() + policy.return_window_days * 86400000)
    : null;
  const returnAllowed = Boolean(policy.returns_enabled) &&
    order?.order_status === ORDER_STATUS.DELIVERED &&
    deadline && deadline.getTime() >= Date.now();
  return {
    cancellation: getCancellationEligibility(order, "customer", policy),
    returns: {
      enabled: Boolean(policy.returns_enabled),
      allowed: Boolean(returnAllowed),
      window_days: policy.return_window_days,
      deadline,
      require_images: Boolean(policy.return_require_images),
      reasons: policy.return_reasons,
    },
  };
};
