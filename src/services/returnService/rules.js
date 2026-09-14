// Integer minor units avoid multiplying a rounded per-unit refund.
export const paise = (amount) => Math.round(Number(amount || 0) * 100);
export const quantityAmount = (totalPaise, purchased, offset, quantity) =>
  Math.floor(totalPaise * (offset + quantity) / purchased) - Math.floor(totalPaise * offset / purchased);

export const requestAmount = (total, purchased, quantity, available, reserved) =>
  Math.max(0, Math.min(total - reserved, quantity === available ? total - reserved : Math.floor(total / purchased) * quantity));

export const eligibleQuantity = (item, requests) => Math.max(0, item.quantity - requests
  .filter((r) => !['rejected', 'cancelled'].includes(r.status))
  .flatMap((r) => r.items)
  .filter((r) => String(r.order_item_id) === String(item._id))
  .reduce((sum, r) => sum + r.quantity, 0));

export const returnEligibility = (order, policy, items, requests, now = Date.now()) => {
  const deadline = order.delivered_at
    ? new Date(new Date(order.delivered_at).getTime() + policy.return_window_days * 86400000) : null;
  const allowed = Boolean(policy.returns_enabled && deadline && deadline.getTime() >= now &&
    ['delivered', 'return_requested', 'returned'].includes(order.order_status) && !order.replacement_return_id);
  const quantities = Object.fromEntries(items.map((item) => [String(item._id), allowed ? eligibleQuantity(item, requests) : 0]));
  return { enabled: Boolean(policy.returns_enabled), allowed: allowed && Object.values(quantities).some((q) => q > 0),
    deadline, window_days: policy.return_window_days, require_images: policy.return_require_images,
    reasons: policy.return_reasons, types: ['refund', 'replacement'], eligible_quantities: quantities };
};

const statusMap = {
  'return initiated': 'scheduled', 'return pickup generated': 'scheduled', 'pickup scheduled': 'scheduled',
  'return pickup rescheduled': 'rescheduled', 'pickup rescheduled': 'rescheduled',
  'return out for pickup': 'out_for_pickup', 'out for pickup': 'out_for_pickup',
  'return picked up': 'picked_up', 'picked up': 'picked_up',
  'return in transit': 'in_transit', 'in transit': 'in_transit',
  'return delivered': 'delivered', 'delivered': 'delivered',
  'return pickup error': 'failed', 'pickup failed': 'failed', 'pickup error': 'failed',
  'return canceled': 'cancelled', 'return cancelled': 'cancelled',
};
export const mapReverseStatus = (raw) => statusMap[String(raw).toLowerCase().replace(/[_-]/g, ' ').trim()] || null;
export const canAdvancePickup = (from, to) => {
  if (!to || from === to || from === 'delivered' || from === 'cancelled') return false;
  const rank = { not_scheduled: 0, scheduled: 1, rescheduled: 1, failed: 1, out_for_pickup: 2, picked_up: 3, in_transit: 4, delivered: 5, cancelled: 6 };
  if (['failed', 'rescheduled', 'cancelled'].includes(to)) return rank[from] < 3;
  return rank[to] >= (rank[from] || 0);
};
export const pickupLabels = { scheduled: 'Pickup Scheduled', rescheduled: 'Pickup Rescheduled', out_for_pickup: 'Out for Pickup', picked_up: 'Picked Up', in_transit: 'Return in Transit', delivered: 'Received', failed: 'Pickup Failed', cancelled: 'Pickup Cancelled' };
export const returnLabels = { requested: 'Requested', approved: 'Approved', received: 'Received', processing: 'Quality Check', qc_failed: 'Quality Check Failed', refund_pending: 'Refund Processing', refund_failed: 'Refund Needs Attention', manual_action_required: 'Refund Processing', replacement_pending: 'Replacement Processing', replacement_shipped: 'Replacement Shipped', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' };
