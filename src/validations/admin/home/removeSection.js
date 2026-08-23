import { celebrate, Joi } from "celebrate";

export const removeSection = celebrate({
  params: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
});
