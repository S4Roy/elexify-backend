import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().integer().min(1).max(10000).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    parent_category: Joi.string().optional().allow("", null),
    type: Joi.string().optional().allow("", null),
    parent_category_slug: Joi.string().optional().allow("", null),
    search_key: Joi.string().max(200).optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "sort_order"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    ids: Joi.string().max(5000).optional().allow("", null),
    featured: Joi.string().optional().allow("", null).valid("true", "false"),
  }),
});
