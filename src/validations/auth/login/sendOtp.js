import { celebrate, Joi, Segments } from "celebrate";

export const sendOtp = celebrate({
  [Segments.BODY]: Joi.object({
    phone_code: Joi.string()
      .pattern(/^[0-9]{1,4}$/)
      .required()
      .messages({
        "string.empty": "Phone code is required",
        "string.pattern.base": "Phone code must be numeric (1–4 digits)",
      }),
    phone_number: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        "string.empty": "Phone number is required",
        "string.pattern.base": "Phone number must be a valid 10-digit number",
      }),
  }),
});
