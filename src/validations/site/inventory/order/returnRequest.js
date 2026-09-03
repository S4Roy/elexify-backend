import { celebrate, Joi } from "celebrate";

export const createReturn = celebrate({ body: Joi.object({
  order_id: Joi.string().hex().length(24).required(),
  items: Joi.array().items(Joi.object({
    order_item_id: Joi.string().hex().length(24).required(),
    quantity: Joi.number().integer().min(1).required(),
  })).min(1).max(100).required(),
  reason: Joi.string().trim().min(2).max(100).required(),
  comment: Joi.string().trim().max(1000).allow("", null).optional(),
  evidence: Joi.array().items(Joi.string().hex().length(24)).max(10).unique().optional(),
}) });
