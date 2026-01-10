import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    _id: Joi.string().optional().allow("", null),
    category: Joi.string().optional().allow("", null),
    tags: Joi.string().optional().allow("", null),
    classifications: Joi.string().optional().allow("", null),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("name", "created_at", "type"),
    stock_status: Joi.string()
      .optional()
      .allow("", null)
      .valid("in_stock", "low_stock", "out_of_stock"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    all: Joi.string()
      .optional()
      .allow("", null)
      .valid("true", "false")
      .messages({
        "any.only": "All must be either 'true' or 'false'",
      }),
  }),
});
