import { orderService } from "../../../../services/index.js";

// "Fetch current status" button on Order Details — resyncs an already
// Shiprocket-linked order from a live lookup, for when the webhook missed
// or was delayed. See services/orderService/packages/syncShiprocketStatus.js.
export const syncShiprocketStatus = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const { order, changed, results } = await orderService.syncShiprocketStatus({
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
