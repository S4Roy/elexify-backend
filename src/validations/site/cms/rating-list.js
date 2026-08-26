import { celebrate, Joi } from "celebrate";

export const ratingList = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "rating"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    product_id: Joi.string().optional().allow("", null),
    variation_id: Joi.string().optional().allow("", null),
  }),
});
