import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    import_source: Joi.string().valid("backup", "other").optional().allow("", null),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "status", "email", "mobile"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    status: Joi.string().optional().allow("", null),
    from_date: Joi.string().optional().allow("", null),
    to_date: Joi.string().optional().allow("", null),
    email_verified: Joi.string().optional().allow("", null).valid("yes", "no"),
    mobile_verified: Joi.string().optional().allow("", null).valid("yes", "no"),
  }),
});
