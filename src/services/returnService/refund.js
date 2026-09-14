import mongoose from 'mongoose';
import Order from '../../models/Order.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import { StatusError } from '../../config/index.js';
import { fetchRazorpayPayment, refundRazorpayPayment, fetchRazorpayRefund } from '../paymentService/refundRazorpayPayment.js';
import { sendReturnNotification } from '../notification/sendReturnNotification.js';
import { paise } from './rules.js';

export const settleReturnRefund = async (requestId, response) => {
  if (!['processed', 'failed'].includes(response.status)) return ReturnRequest.findById(requestId);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await ReturnRequest.findOne({ _id: requestId, 'refund.status': 'pending' }).session(session);
      if (!request) { result = await ReturnRequest.findById(requestId).session(session); return; }
      if (request.refund.provider_ref !== response.id || paise(request.refund.amount) !== Number(response.amount)) throw StatusError.conflict('Refund provider response does not match the request');
      const order = await Order.findOneAndUpdate({ _id: request.order_id }, { $set: { updated_at: new Date() } }, { new: true, session });
      const processed = response.status === 'processed';
      request.status = processed ? 'completed' : 'refund_failed';
      request.refund.status = processed ? 'processed' : 'failed';
      request.refund.processed_at = processed ? new Date() : null;
      request.refund.failure_reason = processed ? null : 'Payment provider reported refund failure';
      request.timeline.push({ event: processed ? 'refund_completed' : 'refund_failed', label: processed ? 'Refund Completed' : 'Refund Needs Attention', status: request.status, actor_type: 'system' });
      await request.save({ session });
      const completed = await ReturnRequest.find({ order_id: order._id, 'refund.status': 'processed' }).session(session);
      const refunded = completed.reduce((sum, r) => sum + paise(r.refund.amount), 0);
      if (processed) await Order.updateOne({ _id: order._id }, { $set: { payment_status: refunded >= paise(order.grand_total) ? 'refunded' : 'partially_refunded' } }, { session });
      result = request;
    });
  } finally { await session.endSession(); }
  if (result?.status === 'completed') await sendReturnNotification({ request: result, event: 'RETURN_COMPLETED' });
  return result;
};

export const processReturnRefund = async (requestId) => {
  // Only one process may submit. A timeout remains pending for reconciliation;
  // never assume a provider receipt is an idempotency guarantee.
  const request = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'refund_pending', 'refund.attempted_at': null, 'refund.provider_ref': null },
    { $set: { 'refund.attempted_at': new Date() } }, { new: true });
  if (!request) return ReturnRequest.findById(requestId);
  const order = await Order.findById(request.order_id);
  try {
    const paymentId = order.payment_meta?.razorpay_payment_id;
    if (!paymentId) throw new Error('Payment reference is missing');
    const payment = await fetchRazorpayPayment(paymentId);
    const amount = paise(request.refund.amount);
    if (amount <= 0 || amount > Number(payment.amount) - Number(payment.amount_refunded || 0)) throw new Error('Refund exceeds captured balance');
    const response = await refundRazorpayPayment(paymentId, amount, request.refund.idempotency_key);
    if (!response?.id) throw new Error('Provider returned no refund reference');
    await ReturnRequest.updateOne({ _id: request._id, 'refund.status': 'pending' }, { $set: { 'refund.provider_ref': response.id } });
    return settleReturnRefund(request._id, response);
  } catch (error) {
    await ReturnRequest.updateOne({ _id: request._id, 'refund.status': 'pending' }, { $set: { 'refund.failure_reason': 'Refund submission needs provider reconciliation. Do not submit another refund.' } });
    return ReturnRequest.findById(request._id);
  }
};

export const reconcileOneReturnRefund = async (request) => {
  if (!request.refund.provider_ref) {
    if (!request.refund.attempted_at) return processReturnRefund(request._id);
    const { getRazorpayClient } = await import('../integrationCredentials/razorpay.js');
    const order = await Order.findById(request.order_id);
    if (!order?.payment_meta?.razorpay_payment_id) return request;
    const client = await getRazorpayClient();
    // Query the original payment, never re-submit an uncertain request.
    const refunds = await client.payments.fetchMultipleRefund(order.payment_meta.razorpay_payment_id, { count: 100 });
    const found = refunds.items?.find((r) => r.receipt === request.refund.idempotency_key && Number(r.amount) === paise(request.refund.amount));
    if (!found) return request;
    await ReturnRequest.updateOne({ _id: request._id, 'refund.provider_ref': null }, { $set: { 'refund.provider_ref': found.id } });
    return settleReturnRefund(request._id, found);
  }
  return settleReturnRefund(request._id, await fetchRazorpayRefund(request.refund.provider_ref));
};
