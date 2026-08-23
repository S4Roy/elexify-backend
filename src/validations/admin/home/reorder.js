import { celebrate, Joi } from "celebrate";

export const reorder = celebrate({
  body: Joi.object({
    order: Joi.array()
      .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
      .min(1)
      .required(),
  }),
});
