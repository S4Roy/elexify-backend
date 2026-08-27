import { orderService } from "../../../../services/index.js";
import { StatusError } from "../../../../config/index.js";

export const cancel = async (req, res, next) => {
  try {
    const { order_id, reason, comment } = req.body;
    const user_id = req.auth?.user_id || null;

    if (!user_id) {
      throw StatusError.unauthorized(req.__("Unauthorized"));
    }

    const order = await orderService.cancelOrder({
      orderId: order_id,
      actorType: "customer",
      actorId: user_id,
      reason,
      comment,
    });

    return res.status(200).json({
      status: "success",
      message: "Order cancelled successfully",
      data: {
        order_status: order.order_status,
        payment_status: order.payment_status,
        cancellation: order.cancellation,
        refund: order.refund,
      },
    });
  } catch (error) {
    next(error);
  }
};
