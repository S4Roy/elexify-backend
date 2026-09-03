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

export const receiveReturn = async (req, res, next) => {
  try {
    const request = await orderService.receiveReturnRequest({ requestId: req.body.return_request_id, adminId: req.auth.user_id });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_RECEIVED", metadata: { return_request_id: request._id, order_id: request.order_id } });
    res.status(200).json({ status: "success", message: "Return marked as received.", data: request });
  } catch (error) { next(error); }
};

export const inspectReturn = async (req, res, next) => {
  try {
    const request = await orderService.inspectReturnRequest({ requestId: req.body.return_request_id, adminId: req.auth.user_id, items: req.body.items, note: req.body.note });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_INSPECTED", metadata: { return_request_id: request._id, order_id: request.order_id, status: request.status, refund_amount: request.refund?.amount } });
    res.status(200).json({ status: "success", message: "Return inspection completed.", data: request });
  } catch (error) { next(error); }
};

export const completeManualRefund = async (req, res, next) => {
  try {
    const request = await orderService.completeManualReturnRefund({ requestId: req.body.return_request_id, adminId: req.auth.user_id, reference: req.body.reference, note: req.body.note });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_REFUND_RECORDED", reason: req.body.note || null, metadata: { return_request_id: request._id, order_id: request.order_id, amount: request.refund.amount, reference: req.body.reference } });
    res.status(200).json({ status: "success", message: "Manual refund recorded as completed.", data: request });
  } catch (error) { next(error); }
};
