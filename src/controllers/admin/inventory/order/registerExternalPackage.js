import { orderService } from "../../../../services/index.js";

// Lets an admin mark an order "packed" by linking a Shiprocket order that
// was booked out-of-band, verified live against Shiprocket before anything
// is written — see services/orderService/packages/registerExternalPackage.js
// for the full validation flow. Deliberately single-order only: unlike the
// bulk status endpoint, each order here needs its own distinct Shiprocket
// reference, which doesn't fit a uniform bulk payload.
export const registerExternalPackage = async (req, res, next) => {
  try {
    const { order_id, shiprocket_order_id, reason } = req.body;
    const { pkg, order } = await orderService.registerExternalPackage({
      orderId: order_id,
      shiprocketOrderId: shiprocket_order_id,
      reason,
      adminId: req.auth.user_id,
    });
    return res.status(201).json({
      status: "success",
      data: { package_id: pkg._id, order_status: order.order_status },
    });
  } catch (error) {
    next(error);
  }
};
