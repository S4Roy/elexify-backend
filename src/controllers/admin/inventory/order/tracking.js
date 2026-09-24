import Order from "../../../../models/Order.js";
import { StatusError } from "../../../../config/index.js";
import { buildOrderTracking } from "../../../../services/orderService/tracking/buildOrderTracking.js";

/**
 * GET /admin/inventory/order/tracking?order_id=<_id>[&refresh=true]
 * Staff tracking view for the order-details page: the same model the
 * storefront shows, plus Shiprocket ids, scan sources and the full status
 * history with reasons. `refresh=true` re-pulls courier scans now (limited
 * to once a minute per shipment) instead of waiting for the 15-minute cache.
 */
export const tracking = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.query.order_id, deleted_at: null }).lean();
    if (!order) throw StatusError.notFound(req.__("Order not found"));

    res.status(200).json({
      status: "success",
      message: req.__("Tracking fetched successfully"),
      data: await buildOrderTracking(order, { adminView: true, force: String(req.query.refresh) === "true" }),
    });
  } catch (error) {
    next(error);
  }
};
