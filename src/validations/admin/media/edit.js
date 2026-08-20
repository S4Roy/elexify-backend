import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Media ID is required",
        "string.pattern.base": "Invalid Media ID format",
      }),
    alt_text: Joi.string().optional().allow("", null).max(255),
  }),
});
