import { celebrate, Joi } from "celebrate";

export const details = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    slug: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});
