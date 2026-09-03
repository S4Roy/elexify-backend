import { celebrate, Joi } from "celebrate";

export const reviewReturn = celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  action: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().trim().max(1000).when("action", { is: "reject", then: Joi.required(), otherwise: Joi.allow("", null).optional() }),
}) });

export const listReturns = celebrate({ query: Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid("requested", "approved", "rejected", "cancelled", "received", "processing", "refund_pending", "refund_failed", "manual_action_required", "completed").optional(),
}) });

export const receiveReturn = celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
}) });

export const inspectReturn = celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  items: Joi.array().items(Joi.object({
    return_item_id: Joi.string().hex().length(24).required(),
    accepted_quantity: Joi.number().integer().min(0).required(),
    disposition: Joi.string().valid("restock", "damaged").required(),
    note: Joi.string().trim().max(500).allow("", null).optional(),
  })).min(1).max(100).required(),
  note: Joi.string().trim().max(1000).allow("", null).optional(),
}) });

export const completeManualRefund = celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  reference: Joi.string().trim().min(3).max(200).required(),
  note: Joi.string().trim().max(1000).allow("", null).optional(),
}) });
