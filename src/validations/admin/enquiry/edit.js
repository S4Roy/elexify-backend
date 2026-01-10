import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Enquiry ID is required",
        "string.pattern.base": "Invalid Enquiry ID format",
      }),

    status: Joi.string()
      .valid("open", "handled", "closed", "spam")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either open, handled, closed or spam",
      }),
  }),
});
