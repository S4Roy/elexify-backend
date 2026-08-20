import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional().messages({
      "number.base": "Page must be a number",
    }),

    limit: Joi.number().optional().messages({
      "number.base": "Limit must be a number",
    }),

    code: Joi.string().optional().allow("", null).messages({
      "string.base": "Coupon code must be a string",
    }),

    applicable_for: Joi.string()
      .optional()
      .allow("", null)
      .valid("user", "channel_partner", "both")
      .messages({
        "any.only": "Applicable for must be user, channel_partner, or both",
      }),

    applicable_scope: Joi.string()
      .optional()
      .allow("", null)
      .valid("all", "product", "variation", "category", "brand")
      .messages({
        "any.only":
          "Applicable scope must be all, product, variation, category, or brand",
      }),

    search_key: Joi.string().optional().allow("", null).messages({
      "string.base": "Search key must be a string",
    }),

    status: Joi.string().optional().allow("", null).messages({
      "string.base": "Status must be a string",
    }),

    discount_type: Joi.string()
      .optional()
      .allow("", null)
      .valid("percentage", "fixed")
      .messages({
        "any.only": "Discount type must be percentage or fixed",
      }),

    from_date: Joi.string().optional().allow("", null),
    to_date: Joi.string().optional().allow("", null),

    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("code", "title", "created_at", "start_date", "end_date")
      .messages({
        "any.only":
          "Sort by must be one of code, title, created_at, start_date, or end_date",
      }),

    sort_order: Joi.number().optional().allow(null).valid(-1, 1).messages({
      "any.only": "Sort order must be 1 (asc) or -1 (desc)",
    }),
  }),
});
