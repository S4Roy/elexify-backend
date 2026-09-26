import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    import_source: Joi.string()
      .valid("backup", "other")
      .optional()
      .allow("", null),
    presence: Joi.string()
      .valid("online", "offline")
      .optional()
      .allow("", null),
    active_sessions: Joi.string().valid("yes", "no").optional().allow("", null),
    order_activity: Joi.string()
      .valid("none", "one", "repeat")
      .optional()
      .allow("", null),
    has_email: Joi.string().valid("yes", "no").optional().allow("", null),
    has_mobile: Joi.string().valid("yes", "no").optional().allow("", null),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "status", "email", "mobile", "order_activity", "session_activity", "source"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    status: Joi.string().optional().allow("", null),
    from_date: Joi.string().optional().allow("", null),
    to_date: Joi.string().optional().allow("", null),
    email_verified: Joi.string().optional().allow("", null).valid("yes", "no"),
    mobile_verified: Joi.string().optional().allow("", null).valid("yes", "no"),
  }),
});
