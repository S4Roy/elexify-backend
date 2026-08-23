import { celebrate, Joi } from "celebrate";

export const updateSection = celebrate({
  params: Joi.object({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object({
    title: Joi.string().allow("", null).max(150),
    subtitle: Joi.string().allow("", null).max(300),
    enabled: Joi.boolean().optional(),
    order: Joi.number().optional(),
    config: Joi.object().unknown(true).optional(),
    schedule: Joi.object({
      startAt: Joi.date().allow(null),
      endAt: Joi.date().allow(null),
    }).optional(),
  }),
});
