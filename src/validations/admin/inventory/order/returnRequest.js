import { celebrate, Joi } from "celebrate";

export const reviewReturn = celebrate({ body: Joi.object({
  return_request_id: Joi.string().hex().length(24).required(),
  action: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().trim().max(1000).when("action", { is: "reject", then: Joi.required(), otherwise: Joi.allow("", null).optional() }),
}) });

export const listReturns = celebrate({ query: Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid("requested", "approved", "rejected", "cancelled").optional(),
}) });
