import { celebrate, Joi } from "celebrate";

export const cartManage = celebrate({
  body: Joi.object({
    product_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Product ID is required",
        "string.pattern.base": "Invalid Product ID format",
      }),
    variation_id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .allow(null, "")
      .messages({
        "string.pattern.base": "Invalid Variation ID format",
      }),
    quantity: Joi.number().integer().min(0).max(100000).required().messages({
      "number.base": "Quantity must be a number",
      "number.min": "Quantity must be at least 0",
      "number.max": "Quantity cannot exceed 100000",
      "any.required": "Quantity is required",
    }),
  }),
});
