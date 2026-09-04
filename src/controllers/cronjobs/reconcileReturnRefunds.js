import ReturnRequest from "../../models/ReturnRequest.js";
import Order from "../../models/Order.js";
import { fetchRazorpayRefund } from "../../services/paymentService/refundRazorpayPayment.js";
import { PAYMENT_STATUS } from "../../constants/orderStatus.js";
import { notificationService } from "../../services/index.js";

export const reconcileReturnRefunds = async () => {
  const requests = await ReturnRequest.find({ status: "refund_pending", "refund.provider": "razorpay", "refund.provider_ref": { $ne: null } }).limit(100);
  for (const request of requests) {
    try {
      const external = await fetchRazorpayRefund(request.refund.provider_ref);
      if (!['processed', 'failed'].includes(external?.status)) continue;
      const processed = external.status === 'processed';
      request.status = processed ? 'completed' : 'refund_failed';
      request.refund.status = processed ? 'processed' : 'failed';
      request.refund.failure_reason = processed ? null : (external.error_description || 'Refund failed at Razorpay');
      request.refund.processed_at = processed ? new Date() : null;
      await request.save();
      const order = await Order.findById(request.order_id);
      if (!order) continue;
      const full = request.refund.amount >= order.grand_total;
      order.payment_status = processed ? (full ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED) : PAYMENT_STATUS.REFUND_FAILED;
      await order.save();
      if (processed) notificationService.sendOrderNotification({ order, event: 'REFUND_COMPLETED', data: { refund_amount: request.refund.amount }, dedupeKey: `${request.request_number}:REFUND_COMPLETED` });
    } catch (error) {
      console.error(`Return refund reconciliation failed for ${request.request_number}:`, error.message);
    }
  }
};
