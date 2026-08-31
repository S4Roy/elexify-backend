import { celebrate, Joi } from "celebrate";

export const verifyMobileChange = celebrate({
  body: Joi.object({
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length": "OTP must be 6 digits",
      "string.pattern.base": "OTP must contain digits only",
      "string.empty": "OTP is required",
    }),
  }),
});
