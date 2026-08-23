import { celebrate, Joi } from "celebrate";

export const estimate = celebrate({
  body: Joi.object({
    postcode: Joi.string().trim().min(3).max(12).required(),
    country: Joi.number().optional().default(101),
    state: Joi.number().optional().allow(null),
    product_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({ "string.pattern.base": "Invalid Product ID format" }),
    variation_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional()
      .allow(null, "")
      .messages({ "string.pattern.base": "Invalid Variation ID format" }),
  }),
});
