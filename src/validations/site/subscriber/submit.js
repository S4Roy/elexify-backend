import { celebrate, Joi } from "celebrate";

export const submit = celebrate({
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.empty": "Email is required",
      "string.email": "Invalid email address",
    }),
  }),
});
