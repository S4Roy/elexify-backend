import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    product: Joi.string().required().messages({
      "any.required": "Product ID is required",
      "string.base": "Product ID must be a string",
    }),

    type: Joi.string().valid("in", "out").required().messages({
      "any.only": "Stock type must be either 'in' or 'out'",
      "any.required": "Stock type is required",
    }),

    quantity: Joi.number().integer().min(1).max(100000).required().messages({
      "number.base": "Quantity must be a number",
      "number.min": "Quantity must be at least 1",
      "number.max": "Quantity cannot exceed 100000",
      "any.required": "Quantity is required",
    }),

    cost_price: Joi.number()
      .min(0)
      .max(1000000)
      .optional()
      .allow(null)
      .messages({
        "number.base": "Cost price must be a number",
        "number.min": "Cost price cannot be negative",
        "number.max": "Cost price cannot exceed 1,000,000",
      }),

    selling_price: Joi.number()
      .min(0)
      .max(1000000)
      .optional()
      .allow(null)
      .messages({
        "number.base": "Selling price must be a number",
        "number.min": "Selling price cannot be negative",
        "number.max": "Selling price cannot exceed 1,000,000",
      }),

    note: Joi.string().max(500).optional().allow(null, "").messages({
      "string.max": "Note cannot exceed 500 characters",
    }),
  }),
});
