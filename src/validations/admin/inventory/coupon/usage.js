import { celebrate, Joi } from "celebrate";

export const usageQuerySchema = Joi.object({
  coupon: Joi.string().hex().length(24),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search_key: Joi.string().trim().max(100).allow(''),
  status: Joi.string().valid('applied', 'refunded'),
  from_date: Joi.date().iso(),
  to_date: Joi.date().iso().when('from_date', { is: Joi.exist(), then: Joi.date().min(Joi.ref('from_date')) }),
  sort_order: Joi.number().valid(-1, 1).default(-1),
});
export const usage = celebrate({ query: usageQuerySchema });
