import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    slug: Joi.string().optional().allow("", null),
    value: Joi.string().optional().allow("", null),
  }),
});
