import Order from "../../../../models/Order.js";
import OrderItem from "../../../../models/OrderItem.js";
import Package from "../../../../models/Package.js";
import ReturnRequest from "../../../../models/ReturnRequest.js";
// Registers the "users" model for the recent-orders populate().
import "../../../../models/User.js";
import { dashboardHelper } from "../../../../helpers/index.js";

const ratio = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * GET /api/admin/inventory/order/overview?from&to&channel&payment
 *
 * The dashboard's "store at a glance" data in one call:
 *   action_items  — the current fulfilment backlog (not filtered: work
 *                   waiting now is waiting regardless of the view chosen)
 *   payment_mix   — orders/revenue by payment type in the range
 *   recent_orders — latest orders in the range
 *   metrics       — items sold, cancellation rate, returning-customer rate
 * Range/segment filters match every other dashboard endpoint
 * (helpers/dashboard/orderFilters.js).
 */
export const overview = async (req, res, next) => {
  try {
    const { startDate, endDate } = dashboardHelper.resolveDateRange(req.query);
    const segment = dashboardHelper.orderSegmentMatch(req.query);
    const inRange = { deleted_at: null, ...segment, created_at: { $gte: startDate, $lte: endDate } };
    const live = { deleted_at: null };

    const [backlog, failedBookings, returnRequests, paymentMix, recent, rangeTotals, itemsSold, customersInRange] =
      await Promise.all([
        Order.aggregate([
          { $match: { ...live, order_status: { $in: ["pending", "confirmed", "processing", "packed", "cancel_requested"] } } },
          { $group: { _id: "$order_status", count: { $sum: 1 } } },
        ]),
        Package.countDocuments({ integration_status: { $in: ["failed", "unknown"] }, status: { $ne: "cancelled" } }),
        ReturnRequest.countDocuments({ status: { $in: ["requested", "manual_action_required", "refund_failed"] } }),
        Order.aggregate([
          { $match: inRange },
          {
            $group: {
              _id: {
                $cond: [
                  { $eq: ["$is_partial_cod", true] },
                  "partial_cod",
                  { $cond: [{ $eq: ["$payment_method", "cod"] }, "cod", { $cond: [{ $eq: ["$payment_method", "razorpay"] }, "prepaid", "other"] }] },
                ],
              },
              orders: { $sum: 1 },
              revenue: { $sum: dashboardHelper.revenueSumExpr() },
            },
          },
          { $sort: { orders: -1 } },
        ]),
        Order.find(inRange)
          .sort({ created_at: -1 })
          .limit(6)
          .populate("user", "name")
          .select("id created_at order_status payment_status payment_method is_partial_cod grand_total currency user total_items")
          .lean(),
        Order.aggregate([
          { $match: inRange },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              cancelled: { $sum: { $cond: [{ $in: ["$order_status", ["cancelled", "failed"]] }, 1, 0] } },
            },
          },
        ]),
        // One pass over order_items for the qualifying orders (a per-order
        // $lookup is far slower — order_items.order_id has no index).
        Order.distinct("_id", { ...inRange, ...dashboardHelper.revenueStatusMatch }).then((ids) =>
          ids.length
            ? OrderItem.aggregate([{ $match: { order_id: { $in: ids } } }, { $group: { _id: null, qty: { $sum: "$quantity" } } }])
            : [],
        ),
        Order.distinct("user", { ...inRange, user: { $ne: null } }),
      ]);

    // Returning = ordered in this range and had an order before it.
    const returning = customersInRange.length
      ? (await Order.distinct("user", { deleted_at: null, user: { $in: customersInRange }, created_at: { $lt: startDate } })).length
      : 0;

    const byStatus = Object.fromEntries(backlog.map((row) => [row._id, row.count]));
    const totals = rangeTotals[0] || { orders: 0, cancelled: 0 };

    res.status(200).json({
      status: "success",
      message: req.__("Dashboard overview fetched successfully"),
      data: {
        action_items: {
          to_confirm: byStatus.pending || 0,
          to_pack: (byStatus.confirmed || 0) + (byStatus.processing || 0),
          to_ship: byStatus.packed || 0,
          cancel_requests: byStatus.cancel_requested || 0,
          failed_bookings: failedBookings,
          return_requests: returnRequests,
        },
        payment_mix: paymentMix.map((row) => ({ type: row._id, orders: row.orders, revenue: Math.round(row.revenue * 100) / 100 })),
        recent_orders: recent.map((o) => ({
          _id: o._id,
          id: o.id,
          created_at: o.created_at,
          order_status: o.order_status,
          payment_status: o.payment_status,
          payment_type: o.is_partial_cod ? "partial_cod" : o.payment_method === "cod" ? "cod" : "prepaid",
          grand_total: o.grand_total,
          currency: o.currency || "INR",
          total_items: o.total_items || 0,
          customer_name: o.user?.name || null,
        })),
        metrics: {
          items_sold: itemsSold[0]?.qty || 0,
          cancellation_rate: ratio(totals.cancelled, totals.orders),
          customers: customersInRange.length,
          returning_customers: returning,
          returning_customer_rate: ratio(returning, customersInRange.length),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
