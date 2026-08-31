import { celebrate, Joi } from "celebrate";

export const requestMobileChange = celebrate({
  body: Joi.object({
    phone_code: Joi.string().pattern(/^\d{1,4}$/).optional().default("91"),
    mobile: Joi.string().required().messages({
      "string.empty": "Mobile number is required",
    }),
  }),
});
