import ReturnRequest from "../../models/ReturnRequest.js";
import { reconcileOneReturnRefund } from "../../services/returnService/refund.js";
export const reconcileReturnRefunds = async () => {
  const requests = await ReturnRequest.find({ status: 'refund_pending', 'refund.provider': 'razorpay' }).limit(100);
  for (const request of requests) {
    try { await reconcileOneReturnRefund(request); }
    catch (error) { console.error('Return refund reconciliation failed:', request.request_number, error.message); }
  }
};
