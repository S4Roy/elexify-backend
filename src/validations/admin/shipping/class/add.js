import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().max(500).optional().allow("", null),
    is_default: Joi.boolean().optional().default(false),
    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
