import mongoose from "mongoose";
import Order from "../../models/Order.js";
import { STOCK_REASON } from "../../constants/stock.js";
import { revertOrderStock } from "../stock/mutations.js";
import { StatusError } from "../../config/index.js";
import { FORCE_CANCELLABLE_ORDER_STATUSES, ORDER_STATUS } from "../../constants/orderStatus.js";
import { attemptRefund } from "./attemptRefund.js";
import { getCancellationEligibility, getOrderPolicy } from "./orderPolicy.js";

// Shared by both the customer-facing and admin-facing cancel endpoints, so
// eligibility rules, inventory restoration, and refund initiation are
// defined exactly once. `force` (superadmin-only, see routes/admin/inventory
// /order.js) overrides the configured eligibility policy — see
// getCancellationEligibility's force branch.
export const cancelOrder = async ({ orderId, actorType, actorId, reason, comment, force = false }) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw StatusError.notFound("Order not found");
  }

  const filter = { _id: orderId, deleted_at: null };
  if (actorType === "customer") {
    filter.user = actorId;
  }

  let order = await Order.findOne(filter);
  if (!order) {
    throw StatusError.notFound("Order not found");
  }

  // Idempotent no-op: a double-click or retried request against an
  // already-cancelled order just returns the current state, no side effects
  // are re-run.
  if (order.order_status === ORDER_STATUS.CANCELLED) {
    return order;
  }

  const policy = await getOrderPolicy();
  const eligibility = getCancellationEligibility(order, actorType, policy, { force });
  if (!eligibility.allowed) throw StatusError.badRequest(eligibility.reason);
  const allowedStatuses = force
    ? FORCE_CANCELLABLE_ORDER_STATUSES
    : (actorType === "customer" ? policy.customer_cancellation_statuses : policy.admin_cancellation_statuses);

  // Force-cancelling a packed order that already has courier details means
  // Shiprocket may hold an active shipment for it — cancel that first so the
  // courier doesn't still attempt pickup/delivery on an order we're about to
  // mark cancelled+refunded. A Shiprocket rejection (e.g. already picked up)
  // blocks the force-cancel entirely instead of silently proceeding.
  if (force && order.order_status === ORDER_STATUS.PACKED && order.shiprocket_order_id) {
    const { shiprocket } = await import("../index.js");
    const result = await shiprocket
      .cancelOrder(order.shiprocket_order_id)
      .catch((err) => ({ success: false, error: err?.message }));
    if (!result?.success) {
      throw StatusError.badRequest(
        "Could not cancel the shipment on Shiprocket — it may already be with the courier. Cancel it there directly before force-cancelling this order."
      );
    }
  }

  // Claim + inventory restore in one transaction: atomically flip to
  // cancelled only if it's still in an eligible status, and give back
  // whatever stock the order holds (release an unpaid reservation, or
  // restock committed units). If this loses a race to a concurrent cancel
  // request, treat it as an idempotent no-op rather than erroring. Legacy
  // orders placed before stock was tracked hold nothing and restore nothing.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const cancelled = await Order.findOneAndUpdate(
        { _id: order._id, order_status: { $in: allowedStatuses } },
        {
          $set: {
            order_status: ORDER_STATUS.CANCELLED,
            cancellation: {
              reason,
              comment: comment || null,
              requested_at: new Date(),
              cancelled_at: new Date(),
              cancelled_by: actorType,
              forced: force,
            },
          },
        },
        { new: true, session }
      );
      if (!cancelled) return;
      await revertOrderStock({
        order: cancelled,
        reason: STOCK_REASON.ORDER_CANCEL,
        actor: { type: actorType === "customer" ? "customer" : "admin", id: actorId || null },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  order = await Order.findById(order._id);

  // ── Refund ─────────────────────────────────────────────────────────────
  // A razorpay order whose payment actually cleared, or a Partial COD order
  // whose online advance cleared. A refund failure never blocks or reverses
  // the cancellation — the order stays cancelled and stock stays restored
  // regardless.
  const clearedOnlinePayment =
    (order.payment_method === "razorpay" && order.payment_status === "paid") ||
    (order.payment_method === "cod" && order.payment_status === "advance_paid");
  if (clearedOnlinePayment && !order.replacement_return_id) {
    order = await attemptRefund(order);
  }

  return order;
};
