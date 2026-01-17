import { celebrate, Joi, Segments } from "celebrate";

export const verifyOtp = celebrate({
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
    otp: Joi.string()
      .length(6)
      .pattern(/^[0-9]{6}$/)
      .required()
      .messages({
        "string.empty": "OTP is required",
        "string.length": "OTP must be exactly 6 digits",
        "string.pattern.base": "OTP must be a valid 6-digit number",
      }),
  }),
});
