import { celebrate, Joi } from "celebrate";

export const toggleWishList = celebrate({
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
  }),
});
