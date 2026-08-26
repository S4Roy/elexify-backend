import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    pincode: Joi.string()
      .regex(/^\d{6}$/)
      .required()
      .messages({
        "string.pattern.base": "Pincode must be a 6-digit number",
      }),
    district: Joi.string().optional().allow("", null),
    city_id: Joi.number().optional().allow(null),
    state_id: Joi.number().optional().allow(null),
    status: Joi.string().valid("active", "inactive").optional(),
    note: Joi.string().max(300).optional().allow("", null),
  }),
});
