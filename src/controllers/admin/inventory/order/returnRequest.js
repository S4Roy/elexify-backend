import ReturnRequest from "../../../../models/ReturnRequest.js";
import { auditService, orderService } from "../../../../services/index.js";

export const listReturns = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const [docs, total] = await Promise.all([
      ReturnRequest.find(filter).populate("customer_id", "name email mobile").populate("evidence", "url type thumbnail")
        .sort({ requested_at: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean(),
      ReturnRequest.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", data: { docs, totalDocs: total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
  } catch (error) { next(error); }
};

export const reviewReturn = async (req, res, next) => {
  try {
    const request = await orderService.reviewReturnRequest({
      requestId: req.body.return_request_id,
      adminId: req.auth.user_id,
      action: req.body.action,
      note: req.body.note,
    });
    await auditService.recordAudit({
      userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_REVIEWED",
      reason: req.body.note || null,
      metadata: { return_request_id: request._id, order_id: request.order_id, status: request.status },
    });
    res.status(200).json({ status: "success", message: `Return request ${request.status}.`, data: request });
  } catch (error) { next(error); }
};
