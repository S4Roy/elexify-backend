import { StatusError } from '../../../../config/index.js';
import { finalizeCapturedPayment } from '../../../../services/orderService/finalizeCapturedPayment.js';

export const recordManualPayment = async (req, res, next) => {
  try {
    const { order_id, confirmed, ...payment } = req.body;
    const result = await finalizeCapturedPayment({
      orderId: order_id,
      source: 'admin_manual_payment',
      manualPayment: { ...payment, recorded_by: req.auth.user_id },
    });
    res.status(200).json({ status: 'success', message: 'Manual payment recorded', data: {
      payment_status: result.order.payment_status, order_status: result.order.order_status,
    } });
  } catch (error) {
    if (error.code === 11000) return next(StatusError.conflict('Payment receipt already recorded. Refresh and check the payment reference.'));
    next(error);
  }
};
