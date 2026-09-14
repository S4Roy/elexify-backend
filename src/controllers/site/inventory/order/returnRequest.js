import { publicReturn } from "../../../../services/returnService/publicReturn.js";
import ReturnRequest from "../../../../models/ReturnRequest.js";
import { auditService, notificationService, orderService } from "../../../../services/index.js";
import MediaResource from "../../../../resources/MediaResource.js";

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
    notificationService.sendReturnNotification({ request, event: "RETURN_REQUESTED" });
    if (request.status === "approved") notificationService.sendReturnNotification({ request, event: "RETURN_APPROVED" });
    res.status(201).json({ status: "success", message: "Return request submitted successfully.", data: publicReturn(request) });
  } catch (error) { next(error); }
};

export const listReturns = async (req, res, next) => {
  try {
    const data = await ReturnRequest.find({ customer_id: req.auth.user_id })
      .populate("evidence", "url type thumbnail")
      .sort({ requested_at: -1 })
      .lean();
    const normalized = data.map((request) => ({ ...publicReturn(request), evidence: MediaResource.collection(request.evidence || []) }));
    res.status(200).json({ status: "success", data: normalized });
  } catch (error) { next(error); }
};
