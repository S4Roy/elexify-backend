import { celebrate, Joi, Segments } from "celebrate";

export const details = celebrate({
  [Segments.PARAMS]: Joi.object({
    slug: Joi.string().required(),
  }),
});
