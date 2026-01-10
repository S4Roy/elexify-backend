import { celebrate, Joi } from "celebrate";

export const remove = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "ContactUs ID is required",
        "string.pattern.base": "Invalid ContactUs ID format",
      }),
  }),
});
