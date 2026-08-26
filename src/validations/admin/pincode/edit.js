import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Pincode ID is required",
        "string.pattern.base": "Invalid Pincode ID format",
      }),

    status: Joi.string()
      .valid("active", "inactive")
      .optional()
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),

    note: Joi.string().max(300).optional().allow("", null),

    city_id: Joi.number().optional().allow(null),
    state_id: Joi.number().optional().allow(null),
  }),
});
