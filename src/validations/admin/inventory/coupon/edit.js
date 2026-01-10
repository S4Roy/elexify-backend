import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    /* =========================
       COUPON ID
    ========================== */
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Coupon ID is required",
        "string.pattern.base": "Invalid Coupon ID format",
      }),

    /* =========================
       BASIC INFO
    ========================== */
    code: Joi.string()
      .uppercase()
      .trim()
      .min(3)
      .max(30)
      .optional()
      .allow("", null)
      .messages({
        "string.min": "Coupon code must be at least 3 characters",
        "string.max": "Coupon code cannot exceed 30 characters",
      }),

    title: Joi.string().min(3).max(100).optional().allow("", null).messages({
      "string.min": "Title must be at least 3 characters",
      "string.max": "Title cannot exceed 100 characters",
    }),

    description: Joi.string().max(500).optional().allow("", null).messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    /* =========================
       DISCOUNT CONFIG
    ========================== */
    discount_type: Joi.string()
      .valid("percentage", "fixed")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Discount type must be percentage or fixed",
      }),

    discount_value: Joi.number().positive().optional().allow(null).messages({
      "number.positive": "Discount value must be greater than 0",
    }),

    max_discount_amount: Joi.number()
      .positive()
      .optional()
      .allow(null)
      .messages({
        "number.positive": "Max discount amount must be greater than 0",
      }),

    min_cart_value: Joi.number().min(0).optional().allow(null).messages({
      "number.min": "Minimum cart value cannot be negative",
    }),

    /* =========================
       USER TYPE
    ========================== */
    applicable_for: Joi.string()
      .valid("user", "channel_partner", "both")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Applicable for must be user, channel_partner, or both",
      }),

    /* =========================
       APPLICABLE SCOPE
    ========================== */
    applicable_scope: Joi.string()
      .valid("all", "product", "variation", "category", "brand")
      .optional()
      .allow("", null)
      .messages({
        "any.only":
          "Applicable scope must be all, product, variation, category, or brand",
      }),

    applicable_products: Joi.array().items(Joi.string()).optional().allow(null),

    applicable_variations: Joi.array()
      .items(Joi.string())
      .optional()
      .allow(null),

    applicable_categories: Joi.array()
      .items(Joi.string())
      .optional()
      .allow(null),

    applicable_brands: Joi.array().items(Joi.string()).optional().allow(null),

    /* =========================
       USAGE RULES
    ========================== */
    usage_limit: Joi.number()
      .integer()
      .positive()
      .optional()
      .allow(null)
      .messages({
        "number.integer": "Usage limit must be an integer",
      }),

    usage_per_email: Joi.number()
      .integer()
      .min(1)
      .optional()
      .allow(null)
      .messages({
        "number.min": "Usage per email must be at least 1",
      }),

    single_use_per_order: Joi.boolean().optional(),

    /* =========================
       DATE VALIDITY
    ========================== */
    start_date: Joi.date().optional().allow(null),
    end_date: Joi.date().optional().allow(null),

    /* =========================
       EXCLUSIONS
    ========================== */
    exclude_sale_items: Joi.boolean().optional(),
    exclude_ask_for_price: Joi.boolean().optional(),
    exclude_enquiry_products: Joi.boolean().optional(),

    /* =========================
       STATUS
    ========================== */
    status: Joi.string()
      .valid("active", "inactive")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
  }),
});
