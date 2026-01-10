import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Rating ID is required",
        "string.pattern.base": "Invalid Rating ID format",
      }),

    status: Joi.string()
      .valid("approved", "rejected")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either 'approved' or 'rejected'",
      }),
  }),
});
