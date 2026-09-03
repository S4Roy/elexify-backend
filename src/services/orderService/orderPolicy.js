import ShippingSettings from "../../models/ShippingSettings.js";
import { isPackedOrderCancellable, ORDER_STATUS } from "../../constants/orderStatus.js";

export const getCancellationEligibility = (order, actorType, policy) => {
  const isCustomer = actorType === "customer";
  const enabled = isCustomer
    ? policy.customer_cancellation_enabled
    : policy.admin_cancellation_enabled;
  const allowedStatuses = isCustomer
    ? policy.customer_cancellation_statuses
    : policy.admin_cancellation_statuses;

  if (!enabled) return { allowed: false, reason: "Cancellation is disabled by policy." };
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

export const getCustomerOrderCapabilities = (order, policy) => ({
  cancellation: getCancellationEligibility(order, "customer", policy),
  returns: {
    enabled: Boolean(policy.returns_enabled),
    window_days: policy.return_window_days,
    require_images: Boolean(policy.return_require_images),
    reasons: policy.return_reasons,
  },
});
