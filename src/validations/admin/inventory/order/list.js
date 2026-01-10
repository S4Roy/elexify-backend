import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    _id: Joi.string().optional().allow("", null),
    order_status: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid(
        "id",
        "created_at",
        "user.name",
        "order_status",
        "total_items",
        "grand_total",
        "total_amount"
      ),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
  }),
});
