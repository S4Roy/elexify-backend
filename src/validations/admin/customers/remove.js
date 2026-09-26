import { celebrate, Joi } from 'celebrate';
export const remove = celebrate({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({ _id: Joi.string().hex().length(24).optional() }).optional(),
});
