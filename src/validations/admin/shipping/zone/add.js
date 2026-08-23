import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    countries: Joi.array().items(Joi.number()).optional().default([]),
    states: Joi.array().items(Joi.number()).optional().default([]),
    pincode_prefixes: Joi.array().items(Joi.string().trim().max(10)).optional().default([]),
    is_default: Joi.boolean().optional().default(false),
    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
