import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import { StatusError } from "../../../../config/index.js";
import { orderService } from "../../../../services/index.js";

export { MANUAL_ORDER_STATUSES, PACKAGE_CASCADE_STATUSES } from "../../../../services/orderService/manualOrderStatus.js";

export const updateStatus = async (req, res, next) => {
  try {
    const { order_id, expected_status, status, reason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(order_id)) throw StatusError.badRequest("Invalid order ID");

    const order = await Order.findOne({ _id: order_id, deleted_at: null });
    const updated = await orderService.applyManualOrderStatusChange({
      order, expectedStatus: expected_status, status, reason, changedBy: req.auth.user_id,
    });

    return res.status(200).json({ status: "success", data: { order_status: updated.order_status } });
  } catch (error) {
    next(error);
  }
};
