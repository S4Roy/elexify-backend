import { celebrate, Joi } from "celebrate";

export const updateStatus = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Product ID is required",
        "string.pattern.base": "Invalid Product ID format",
      }),

    status: Joi.string().valid("active", "inactive").required().messages({
      "any.only": 'Status must be either "active" or "inactive"',
      "string.empty": "Status is required",
    }),
  }),
});
