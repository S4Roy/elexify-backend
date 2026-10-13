import { celebrate, Joi } from "celebrate";

const statuses = ["subscribed", "unsubscribed", "suppressed", "pending", "answered", "archived", "spam"];
export const list = celebrate({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).optional(),
    slug: Joi.string().optional().allow("", null),
    search_key: Joi.string().max(254).optional().allow("", null),
    sort_by: Joi.string().valid("email", "source", "updated_at", "created_at", "status").optional(),
    sort_order: Joi.number().valid(-1, 1).optional(),
    source: Joi.string().valid("web", "mobile", "api", "widget", "other").optional(),
    status: Joi.string().custom((value, helpers) => value.split(",").every(status => statuses.includes(status)) ? value : helpers.error("any.invalid")).optional().allow("", null),
    from_date: Joi.string().isoDate().optional().allow("", null),
    to_date: Joi.string().isoDate().optional().allow("", null),
  }),
});
