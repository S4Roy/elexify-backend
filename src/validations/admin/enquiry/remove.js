import { celebrate, Joi } from "celebrate";

export const remove = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Enquiry ID is required",
        "string.pattern.base": "Invalid Enquiry ID format",
      }),
  }),
});
