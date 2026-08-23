import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({ "string.pattern.base": "Invalid Shipping Class ID format" }),
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().trim().max(500).optional().allow("", null),
    is_default: Joi.boolean().optional(),
    status: Joi.string().valid("active", "inactive").required(),
  }),
});
