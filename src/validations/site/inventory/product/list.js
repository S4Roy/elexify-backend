import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    currency: Joi.string().optional().allow("", null),
    tags: Joi.string().optional().allow("", null),
    classifications: Joi.string().optional().allow("", null),
    category: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid(
        "name",
        "recommended",
        "created_at",
        "price",
        "avg_rating",
        "discount_percent"
      ),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    price_min: Joi.number().optional().allow("", null),
    price_max: Joi.number().optional().allow("", null),
    ids: Joi.string().optional().allow("", null),
    exclude: Joi.string().optional().allow("", null),
    is_featured: Joi.string().optional().allow("", null).valid("true", "false"),
    is_bestseller: Joi.string().optional().allow("", null).valid("true", "false"),
  }),
});
