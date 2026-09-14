import { bookReversePickup, reconcileReversePickup } from '../../../../services/returnService/pickup.js';
import { createReplacement } from '../../../../services/returnService/replacement.js';
import { reconcileOneReturnRefund } from '../../../../services/returnService/refund.js';
import ReturnRequest from '../../../../models/ReturnRequest.js';
import { StatusError } from '../../../../config/index.js';
import { recordAudit } from '../../../../services/audit/recordAudit.js';

export const returnOperation = async (req, res, next) => {
  try {
    const id = req.body.return_request_id;
    let data;
    switch (req.body.operation) {
      case 'book': data = await bookReversePickup({ requestId: id, adminId: req.auth.user_id, ...req.body }); break;
      case 'track': data = await reconcileReversePickup(id); break;
      case 'replacement': data = await createReplacement(id, req.auth.user_id); break;
      case 'refund': {
        const request = await ReturnRequest.findOne({ _id: id, status: 'refund_pending', 'refund.provider': 'razorpay' });
        if (!request) throw StatusError.conflict('Refund is not awaiting reconciliation');
        data = await reconcileOneReturnRefund(request); break;
      }
    }
    await recordAudit({ userId: data?.customer_id, actorId: req.auth.user_id, req, event: 'RETURN_OPERATION', metadata: { return_request_id: id, operation: req.body.operation } });
    res.status(200).json({ status: 'success', message: 'Return updated.', data });
  } catch (error) { next(error); }
};
