import Order from "../../models/Order.js";
import Package from "../../models/Package.js";
import { StatusError } from "../../config/index.js";

// Manual correction is deliberately limited to fulfillment labels. Cancel,
// refund, return, and parcel changes have their own workflows and side
// effects. Shared by the single-order (controllers/admin/inventory/order/
// updateStatus.js) and bulk (bulkUpdateStatus.js) admin endpoints so both
// stay behind the exact same eligibility rules.
export const MANUAL_ORDER_STATUSES = [
  "pending", "confirmed", "processing", "packed", "shipped",
  "out_for_delivery", "delivered", "failed",
];

// Subset of MANUAL_ORDER_STATUSES that's also a valid Package.status value
// (src/models/Package.js) — the only statuses safe to apply to an order
// that's already been split into one or more packages, since these
// describe a shipment stage a Package can itself be in. Rolling back to
// pending/confirmed/processing once packaging has started isn't offered;
// an admin who needs that uses the dedicated package/cancel workflow.
export const PACKAGE_CASCADE_STATUSES = ["packed", "shipped", "out_for_delivery", "delivered", "failed"];

// Package statuses a manual correction must never touch — an active return
// or a cancelled package belongs to its own dedicated workflow (see
// services/returnService and packages/cancelPackage.js), not this one.
const PACKAGE_CASCADE_EXCLUDED_STATUSES = ["cancelled", "return_requested", "returned"];

const STATUS_RANK = {
  pending: 0, confirmed: 1, processing: 2, packed: 3, shipped: 4,
  out_for_delivery: 5, delivered: 6,
};

/**
 * Validates eligibility, updates Order.order_status, and — when the order
 * has already been split into packages — cascades the same status onto
 * every one of its still-active Package docs, so Order and Package never
 * disagree about fulfillment stage. Throws StatusError on any
 * ineligibility; the single-order endpoint lets that abort the request,
 * the bulk endpoint records it per-item instead.
 *
 * @param {object} params
 * @param {import("mongoose").Document} params.order - already-fetched, non-deleted Order doc
 * @param {string|null} [params.expectedStatus] - optimistic-concurrency check; single-order endpoint only
 * @param {string} params.status - target status, must be in MANUAL_ORDER_STATUSES
 * @param {string} params.reason
 * @param {string} params.changedBy - admin user id, for the audit trail
 */
export const applyManualOrderStatusChange = async ({ order, expectedStatus = null, status, reason, changedBy }) => {
  if (!order) throw StatusError.notFound("Order not found");
  if (!MANUAL_ORDER_STATUSES.includes(status)) {
    throw StatusError.badRequest("Use the dedicated cancellation or return workflow for this status");
  }
  if (expectedStatus != null && order.order_status !== expectedStatus) {
    throw StatusError.conflict("Order status changed. Refresh and try again.");
  }
  if (order.order_status === status) throw StatusError.badRequest("Choose a different status");
  if (["cancelled", "return_requested", "returned"].includes(order.order_status) ||
      order.inventory_reverted || (order.refund?.status && order.refund.status !== "not_required")) {
    throw StatusError.conflict("This order has cancellation, return, or refund effects and cannot be changed manually");
  }

  const activePackages = await Package.find({
    order_id: order._id,
    status: { $nin: PACKAGE_CASCADE_EXCLUDED_STATUSES },
  });
  const hasPackagesOrTracking = order.package_count > 0 || !!order.awb || !!order.shiprocket_order_id || activePackages.length > 0;
  if (hasPackagesOrTracking && !PACKAGE_CASCADE_STATUSES.includes(status)) {
    throw StatusError.conflict(
      `This order has packages or tracking. Choose one of ${PACKAGE_CASCADE_STATUSES.join(", ")} to update its packages too, or use the package workflow directly.`,
    );
  }
  if ((order.payment_method === "razorpay" || order.is_partial_cod) && !["paid", "advance_paid"].includes(order.payment_status) &&
      !["pending", "failed"].includes(status)) {
    throw StatusError.conflict("Record the received payment from the Payment section before advancing fulfillment");
  }

  const changedAt = new Date();
  const fromStatus = order.order_status;
  const targetRank = STATUS_RANK[status] ?? -1;
  const cascading = hasPackagesOrTracking && PACKAGE_CASCADE_STATUSES.includes(status);
  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      order_status: fromStatus,
      deleted_at: null,
      // Once cascading is in play, packages are expected — only guard
      // against a package appearing mid-request for the pre-packaging
      // statuses, where none should exist at all.
      ...(cascading ? {} : { package_count: { $in: [0, null] } }),
    },
    {
      $set: {
        order_status: status,
        updated_at: changedAt,
        processing_at: targetRank >= 2 ? (order.processing_at || changedAt) : null,
        shipped_at: targetRank >= 4 ? (order.shipped_at || changedAt) : null,
        delivered_at: targetRank >= 6 ? (order.delivered_at || changedAt) : null,
      },
      $push: { manual_status_history: {
        from: fromStatus, to: status, reason: reason.trim(),
        changed_by: changedBy, changed_at: changedAt,
      } },
    },
    { new: true },
  );
  if (!updated) throw StatusError.conflict("Order status changed. Refresh and try again.");

  if (cascading && activePackages.length) {
    await Promise.all(activePackages.map((pkg) => {
      const pkgSet = { status };
      if (status === "shipped" && !pkg.shipped_at) pkgSet.shipped_at = changedAt;
      if (status === "delivered" && !pkg.delivered_at) pkgSet.delivered_at = changedAt;
      return Package.updateOne(
        { _id: pkg._id },
        { $set: pkgSet, $push: { timeline: {
          status, occurred_at: changedAt,
          raw: { source: "manual_admin_correction", changed_by: String(changedBy), reason: reason.trim() },
        } } },
      );
    }));
  }

  return updated;
};
