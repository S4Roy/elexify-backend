import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Menu ID is required",
        "any.required": "Menu ID is required",
        "string.pattern.base": "Invalid Menu ID format",
      }),
    name: Joi.string().min(2).max(150).optional(),
    slug: Joi.string().min(2).max(150).optional().allow("", null),
    description: Joi.string().max(500).optional().allow("", null),
  }),
});
