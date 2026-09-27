import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    product_id: Joi.string().hex().length(24).optional(),
    variation_id: Joi.string().hex().length(24).optional().allow(null, ""),
    page: Joi.number().integer().min(1).max(1000000).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});
