import ReturnRequest from "../../../../models/ReturnRequest.js";
import { auditService, orderService } from "../../../../services/index.js";

export const createReturn = async (req, res, next) => {
  try {
    const request = await orderService.createReturnRequest({
      ...req.body,
      orderId: req.body.order_id,
      customerId: req.auth.user_id,
    });
    await auditService.recordAudit({
      userId: req.auth.user_id, req, event: "RETURN_REQUESTED",
      metadata: { return_request_id: request._id, order_id: request.order_id, status: request.status },
    });
    res.status(201).json({ status: "success", message: "Return request submitted successfully.", data: request });
  } catch (error) { next(error); }
};

export const listReturns = async (req, res, next) => {
  try {
    const data = await ReturnRequest.find({ customer_id: req.auth.user_id })
      .populate("evidence", "url type thumbnail")
      .sort({ requested_at: -1 })
      .lean();
    res.status(200).json({ status: "success", data });
  } catch (error) { next(error); }
};
