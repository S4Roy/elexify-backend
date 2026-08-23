import { celebrate, Joi } from "celebrate";

export const update = celebrate({
  body: Joi.object({
    meta_title: Joi.string().allow("", null).max(160),
    meta_description: Joi.string().allow("", null).max(320),
  }),
});
