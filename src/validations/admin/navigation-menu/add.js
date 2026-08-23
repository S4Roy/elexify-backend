import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().min(2).max(150).required().messages({
      "string.empty": "Menu name is required",
      "any.required": "Menu name is required",
    }),
    slug: Joi.string().min(2).max(150).optional().allow("", null),
    description: Joi.string().max(500).optional().allow("", null),
  }),
});
