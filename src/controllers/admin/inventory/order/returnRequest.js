import ReturnRequest from "../../../../models/ReturnRequest.js";
import { auditService, notificationService, orderService } from "../../../../services/index.js";
import { envs } from "../../../../config/index.js";

export const listReturns = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const [docs, total] = await Promise.all([
      ReturnRequest.find(filter).populate("customer_id", "name email mobile").populate("evidence", "url type thumbnail")
        .sort({ requested_at: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean(),
      ReturnRequest.countDocuments(filter),
    ]);
    const normalized = docs.map((doc) => ({ ...doc, evidence: (doc.evidence || []).map((media) => ({ ...media, url: `${envs.s3.BASE_URL}${media.url}`, thumbnail: media.thumbnail ? `${envs.s3.BASE_URL}${media.thumbnail}` : null })) }));
    res.status(200).json({ status: "success", data: { docs: normalized, totalDocs: total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } });
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
    notificationService.sendReturnNotification({ request, event: request.status === "approved" ? "RETURN_APPROVED" : "RETURN_REJECTED" });
    res.status(200).json({ status: "success", message: `Return request ${request.status}.`, data: request });
  } catch (error) { next(error); }
};

export const receiveReturn = async (req, res, next) => {
  try {
    const request = await orderService.receiveReturnRequest({ requestId: req.body.return_request_id, adminId: req.auth.user_id });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_RECEIVED", metadata: { return_request_id: request._id, order_id: request.order_id } });
    notificationService.sendReturnNotification({ request, event: "RETURN_RECEIVED" });
    res.status(200).json({ status: "success", message: "Return marked as received.", data: request });
  } catch (error) { next(error); }
};

export const inspectReturn = async (req, res, next) => {
  try {
    const request = await orderService.inspectReturnRequest({ requestId: req.body.return_request_id, adminId: req.auth.user_id, items: req.body.items, note: req.body.note });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_INSPECTED", metadata: { return_request_id: request._id, order_id: request.order_id, status: request.status, refund_amount: request.refund?.amount } });
    notificationService.sendReturnNotification({ request, event: request.status === "completed" ? "RETURN_COMPLETED" : "RETURN_UPDATED" });
    res.status(200).json({ status: "success", message: "Return inspection completed.", data: request });
  } catch (error) { next(error); }
};

export const completeManualRefund = async (req, res, next) => {
  try {
    const request = await orderService.completeManualReturnRefund({ requestId: req.body.return_request_id, adminId: req.auth.user_id, reference: req.body.reference, note: req.body.note });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_REFUND_RECORDED", reason: req.body.note || null, metadata: { return_request_id: request._id, order_id: request.order_id, amount: request.refund.amount, reference: req.body.reference } });
    notificationService.sendReturnNotification({ request, event: "RETURN_COMPLETED" });
    res.status(200).json({ status: "success", message: "Manual refund recorded as completed.", data: request });
  } catch (error) { next(error); }
};

export const updatePickup = async (req, res, next) => {
  try {
    const request = await orderService.updateReturnPickup({ requestId: req.body.return_request_id, adminId: req.auth.user_id, status: req.body.status, provider: req.body.provider, trackingNumber: req.body.tracking_number, failureReason: req.body.failure_reason, expectedAt: req.body.expected_at });
    await auditService.recordAudit({ userId: request.customer_id, actorId: req.auth.user_id, req, event: "RETURN_PICKUP_UPDATED", metadata: { return_request_id: request._id, status: request.pickup.status, provider: request.pickup.provider, tracking_number: request.pickup.tracking_number } });
    notificationService.sendReturnNotification({ request, event: "RETURN_UPDATED" });
    res.status(200).json({ status: "success", message: req.body.status === "rescheduled" ? "Return pickup rescheduled." : "Return pickup updated.", data: request });
  } catch (error) { next(error); }
};
