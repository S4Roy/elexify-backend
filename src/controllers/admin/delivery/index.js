import { orderService } from "../../../services/index.js";
import { getProofPhoto, listDeliveryStaff, listMyDeliveries, uploadProofPhoto } from "../../../services/orderService/packages/deliveryRun.js";

// Own-delivery riders (delivery.run): every action is scoped to packages
// assigned to req.auth.user_id — see services/orderService/packages/deliveryRun.js.
export const myDeliveries = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", data: await listMyDeliveries(req.auth.user_id) });
  } catch (error) {
    next(error);
  }
};

export const markDelivered = async (req, res, next) => {
  try {
    const riderId = req.auth.user_id;
    const { delivered_at, receiver_name, receiver_relation, notes, cod_method, cod_amount, cod_reference } = req.body;
    const photo = req.files?.photo;
    const photoKey = photo && !Array.isArray(photo) ? await uploadProofPhoto({ packageId: req.params.id, file: photo }) : null;
    const { order } = await orderService.markManualDelivered({
      packageId: req.params.id, riderId, adminId: riderId,
      deliveredAt: delivered_at || new Date(), receiverName: receiver_name, receiverRelation: receiver_relation,
      notes, photoKey,
      codCollection: cod_method ? { amount: Number(cod_amount), method: cod_method, reference: cod_reference } : null,
    });
    res.status(200).json({ status: "success", data: { order_status: order.order_status, payment_status: order.payment_status } });
  } catch (error) {
    next(error);
  }
};

export const failedAttempt = async (req, res, next) => {
  try {
    const riderId = req.auth.user_id;
    const pkg = await orderService.recordFailedAttempt({ packageId: req.params.id, reason: req.body.reason, adminId: riderId, riderId });
    res.status(200).json({ status: "success", data: { attempts: pkg.delivery_attempts.length } });
  } catch (error) {
    next(error);
  }
};

// Admin view of a rider's proof-of-delivery photo.
export const proofPhoto = async (req, res, next) => {
  try {
    const { body, contentType } = await getProofPhoto({ packageId: req.params.id });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store");
    body.pipe(res);
  } catch (error) {
    next(error);
  }
};

// Admin dispatch picker: staff accounts that can run deliveries.
export const deliveryStaff = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", data: await listDeliveryStaff() });
  } catch (error) {
    next(error);
  }
};
