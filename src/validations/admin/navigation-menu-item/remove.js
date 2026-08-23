import { celebrate, Joi } from "celebrate";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export const remove = celebrate({
  params: Joi.object({
    menuId: Joi.string().regex(objectIdPattern).required().messages({
      "string.pattern.base": "Invalid Menu ID format",
    }),
    id: Joi.string().regex(objectIdPattern).required().messages({
      "string.pattern.base": "Invalid Menu Item ID format",
    }),
  }),
});
