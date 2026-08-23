import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    status: Joi.string().optional().allow("", null),
    zone: Joi.string().optional().allow("", null),
    sort_by: Joi.string().optional().allow("", null),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});
