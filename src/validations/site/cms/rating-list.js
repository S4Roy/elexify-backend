import { celebrate, Joi } from "celebrate";

export const ratingList = celebrate({
  query: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    verified_purchase: Joi.boolean().optional(),
    with_media: Joi.boolean().optional(),
    page: Joi.number().integer().min(1).max(1000000).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search_key: Joi.string().max(200).optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "rating"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    product_id: Joi.string().hex().length(24).optional().allow("", null),
    variation_id: Joi.string().hex().length(24).optional().allow("", null),
  }),
});
