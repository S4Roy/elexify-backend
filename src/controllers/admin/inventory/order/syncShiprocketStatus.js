import { orderService } from "../../../../services/index.js";

// "Fetch current status" button on Order Details — always available,
// regardless of whether the order already has a Shiprocket link. If it
// does, resyncs from a live lookup (for when the webhook missed or was
// delayed); if it doesn't, searches Shiprocket live by the order's own
// reference and links it on an unambiguous match. See
// services/orderService/fetchShiprocketDetails.js.
export const syncShiprocketStatus = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const { order, changed, results } = await orderService.fetchShiprocketDetailsForOrder({
      orderId: order_id,
      adminId: req.auth.user_id,
    });
    return res.status(200).json({
      status: "success",
      data: { order_status: order.order_status, changed, results },
    });
  } catch (error) {
    next(error);
  }
};
