import { celebrate, Joi } from "celebrate";
import { STOCK_REASONS, STOCK_TRANSACTION_TYPES } from "../../../../constants/stock.js";

const objectId = Joi.string().hex().length(24);

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    product: objectId.optional().allow("", null),
    variation: objectId.optional().allow("", null),
    type: Joi.string().valid(...STOCK_TRANSACTION_TYPES).optional().allow("", null),
    reason: Joi.string().valid(...STOCK_REASONS).optional().allow("", null),
    actor_type: Joi.string().valid("admin", "customer", "system").optional().allow("", null),
    from: Joi.date().iso().optional().allow("", null),
    to: Joi.date().iso().optional().allow("", null),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});

export const levels = celebrate({
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    search_key: Joi.string().trim().max(100).optional().allow("", null),
    product: objectId.optional().allow("", null),
    stock_status: Joi.string().valid("in_stock", "out_of_stock", "on_backorder").optional().allow("", null),
    low_stock: Joi.boolean().optional(),
  }),
});
