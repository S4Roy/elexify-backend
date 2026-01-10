import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    status: Joi.string().optional().allow("", null),
    id_includes: Joi.string().optional().allow("", null),
    parent_category: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at"),
    type: Joi.string().optional().allow("", null).valid("parent", "sub"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});
