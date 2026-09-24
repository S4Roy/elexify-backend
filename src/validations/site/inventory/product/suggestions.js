import { celebrate, Joi } from "celebrate";

export const suggestions = celebrate({
  params: Joi.object({ slug: Joi.string().trim().max(500).required() }),
});
