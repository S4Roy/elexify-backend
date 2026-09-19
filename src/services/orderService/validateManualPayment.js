import { StatusError } from "../../config/index.js";

export const validateManualPayment = (order, payment) => {
  if (!['pending', 'failed'].includes(order.payment_status) ||
      !['pending', 'confirmed', 'failed'].includes(order.order_status) ||
      order.stock_reserved || order.inventory_reverted || order.manual_payment ||
      (order.refund?.status && order.refund.status !== 'not_required') ||
      !(order.payment_method === 'razorpay' || order.is_partial_cod)) {
    throw StatusError.conflict('This order is not eligible for manual payment. Refresh the order.');
  }
  const expected = Number(order.is_partial_cod ? order.advance_amount : order.grand_total);
  if (!Number.isFinite(payment.amount) || payment.amount <= 0 ||
      Math.round(payment.amount * 100) !== Math.round(expected * 100) ||
      payment.currency !== order.currency) {
    throw StatusError.badRequest('Payment must match the outstanding amount and currency');
  }
  const receivedAt = new Date(payment.received_at);
  if (!Number.isFinite(receivedAt.getTime()) || receivedAt > new Date() ||
      (order.created_at && receivedAt < new Date(order.created_at))) {
    throw StatusError.badRequest('Received date must be between order creation and now');
  }
  if (!['bank_transfer', 'upi', 'cash'].includes(payment.method) ||
      !payment.reference?.trim() || (payment.reason?.trim().length || 0) < 10 ||
      !payment.recorded_by) {
    throw StatusError.badRequest('Payment method, reference, reason and administrator are required');
  }
};
