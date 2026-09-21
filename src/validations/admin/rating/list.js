import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    import_source: Joi.string().valid("backup", "other").optional().allow("", null),
    page: Joi.number().integer().min(1).max(1000000).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    slug: Joi.string().optional().allow("", null),
    search_key: Joi.string().max(200).optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid(
        "rating",
        "flag",
        "name",
        "code",
        "symbol",
        "rates",
        "updated_at",
        "created_at",
        "status"
      ),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    status: Joi.string().optional().allow("", null),
    rating: Joi.string().optional().allow("", null),
  }),
});
