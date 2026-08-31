import { celebrate, Joi } from "celebrate";

export const requestEmailChange = celebrate({
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.empty": "Email is required",
      "string.email": "Email must be a valid email address",
    }),
  }),
});
