import { orderService } from "../../../../services/index.js";

// Own-rider delivery and store pickup — see
// services/orderService/packages/manualFulfillment.js for the lifecycle.
export const manualDispatch = async (req, res, next) => {
  try {
    const { order_id, mode, agent_name, agent_phone, reason, dispatched_at } = req.body;
    const { pkg, order } = await orderService.dispatchManual({
      orderId: order_id, mode, agent: { name: agent_name, phone: agent_phone }, reason, dispatchedAt: dispatched_at, adminId: req.auth.user_id,
    });
    return res.status(201).json({ status: "success", data: { package_id: pkg._id, order_status: order.order_status } });
  } catch (error) {
    next(error);
  }
};

export const manualDelivered = async (req, res, next) => {
  try {
    const { delivered_at, receiver_name, receiver_relation, photo_url, notes, cod_collection } = req.body;
    const { order } = await orderService.markManualDelivered({
      packageId: req.params.id, deliveredAt: delivered_at, receiverName: receiver_name,
      receiverRelation: receiver_relation, photoUrl: photo_url, notes, codCollection: cod_collection,
      adminId: req.auth.user_id,
    });
    return res.status(200).json({ status: "success", data: { order_status: order.order_status, payment_status: order.payment_status } });
  } catch (error) {
    next(error);
  }
};

export const deliveryAttempt = async (req, res, next) => {
  try {
    const pkg = await orderService.recordFailedAttempt({ packageId: req.params.id, reason: req.body.reason, adminId: req.auth.user_id });
    return res.status(200).json({ status: "success", data: { attempts: pkg.delivery_attempts.length } });
  } catch (error) {
    next(error);
  }
};

export const returnToStore = async (req, res, next) => {
  try {
    const { order } = await orderService.returnToStore({ packageId: req.params.id, reason: req.body.reason, adminId: req.auth.user_id });
    return res.status(200).json({ status: "success", data: { order_status: order.order_status } });
  } catch (error) {
    next(error);
  }
};
