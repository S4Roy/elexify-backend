import { celebrate, Joi } from "celebrate";

export const details = celebrate({
  query: Joi.object({
    variation_id: Joi.string().optional().allow("", null),
    currency: Joi.string().optional().allow("", null),
  }),
});
