import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({ "string.pattern.base": "Invalid Shipping Zone ID format" }),
    name: Joi.string().trim().min(2).max(100).optional(),
    countries: Joi.array().items(Joi.number()).optional(),
    states: Joi.array().items(Joi.number()).optional(),
    pincode_prefixes: Joi.array().items(Joi.string().trim().max(10)).optional(),
    is_default: Joi.boolean().optional(),
    status: Joi.string().valid("active", "inactive").required(),
  }),
});
