import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    /* =========================
       BASIC INFO
    ========================== */
    code: Joi.string().uppercase().trim().min(3).max(30).required().messages({
      "string.empty": "Coupon code is required",
      "string.min": "Coupon code must be at least 3 characters",
      "string.max": "Coupon code cannot exceed 30 characters",
    }),

    title: Joi.string().min(3).max(100).required().messages({
      "string.empty": "Coupon title is required",
      "string.min": "Title must be at least 3 characters",
      "string.max": "Title cannot exceed 100 characters",
    }),

    description: Joi.string().max(500).optional().allow("").messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    /* =========================
       DISCOUNT CONFIG
    ========================== */
    discount_type: Joi.string()
      .valid("percentage", "fixed")
      .required()
      .messages({
        "any.only": "Discount type must be percentage or fixed",
      }),

    discount_value: Joi.number().positive().required().messages({
      "number.base": "Discount value must be a number",
      "number.positive": "Discount value must be greater than 0",
    }),

    max_discount_amount: Joi.when("discount_type", {
      is: "percentage",
      then: Joi.number().positive().optional().allow(null),
      otherwise: Joi.forbidden(),
    }),

    min_cart_value: Joi.number().min(0).optional().default(0).messages({
      "number.min": "Minimum cart value cannot be negative",
    }),

    /* =========================
       USER TYPE
    ========================== */
    applicable_for: Joi.string()
      .valid("user", "channel_partner", "both")
      .required()
      .messages({
        "any.only": "Applicable for must be user, channel_partner, or both",
      }),

    /* =========================
       APPLICABLE SCOPE
    ========================== */
    applicable_scope: Joi.string()
      .valid("all", "product", "variation", "category", "brand")
      .default("all")
      .messages({
        "any.only":
          "Applicable scope must be all, product, variation, category, or brand",
      }),

    applicable_products: Joi.when("applicable_scope", {
      is: "product",
      then: Joi.array().items(Joi.string().required()).min(1).required(),
      otherwise: Joi.forbidden(),
    }),

    applicable_variations: Joi.when("applicable_scope", {
      is: "variation",
      then: Joi.array().items(Joi.string().required()).min(1).required(),
      otherwise: Joi.forbidden(),
    }),

    applicable_categories: Joi.when("applicable_scope", {
      is: "category",
      then: Joi.array().items(Joi.string().required()).min(1).required(),
      otherwise: Joi.forbidden(),
    }),

    applicable_brands: Joi.when("applicable_scope", {
      is: "brand",
      then: Joi.array().items(Joi.string().required()).min(1).required(),
      otherwise: Joi.forbidden(),
    }),

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

    usage_per_email: Joi.number().integer().min(1).default(1).messages({
      "number.min": "Usage per email must be at least 1",
    }),

    single_use_per_order: Joi.boolean().default(true),

    /* =========================
       DATE VALIDITY
    ========================== */
    start_date: Joi.date().required().messages({
      "date.base": "Start date must be a valid date",
    }),

    end_date: Joi.date().greater(Joi.ref("start_date")).required().messages({
      "date.greater": "End date must be after start date",
    }),

    /* =========================
       EXCLUSIONS
    ========================== */
    exclude_sale_items: Joi.boolean().default(false),
    exclude_ask_for_price: Joi.boolean().default(true),
    exclude_enquiry_products: Joi.boolean().default(true),

    /* =========================
       STATUS
    ========================== */
    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .messages({
        "any.only": "Status must be either active or inactive",
      }),
  }),
});
