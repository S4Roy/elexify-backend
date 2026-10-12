import { celebrate, Joi } from "celebrate";

export const updateLocation = celebrate({
  body: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    accuracy: Joi.number().min(0).max(100000).allow(null),
    precise: Joi.boolean().allow(null),
  }),
});
