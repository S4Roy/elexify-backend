import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
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
