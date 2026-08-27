import { orderService } from "../../../../services/index.js";

export const retryRefund = async (req, res, next) => {
  try {
    const { order_id } = req.body;

    const order = await orderService.retryRefund({ orderId: order_id });

    return res.status(200).json({
      status: "success",
      message: "Refund retry initiated",
      data: {
        payment_status: order.payment_status,
        refund: order.refund,
      },
    });
  } catch (error) {
    next(error);
  }
};
