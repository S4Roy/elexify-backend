import { celebrate, Joi } from "celebrate";

export const generate = celebrate({
  params: Joi.object({
    product_id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object({
    overwrite: Joi.boolean().optional(),
  }),
});
