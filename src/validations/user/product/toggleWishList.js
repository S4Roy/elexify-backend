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
  }),
});
