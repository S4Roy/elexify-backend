import { celebrate, Joi } from "celebrate";

export const usage = celebrate({
  params: Joi.object({
    id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Media ID is required",
        "string.pattern.base": "Invalid Media ID format",
      }),
  }),
});
