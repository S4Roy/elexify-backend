import { celebrate, Joi } from "celebrate";

export const submit = celebrate({
  body: Joi.object({
    email: Joi.string().trim().lowercase().email().max(254).required().messages({
      "string.empty": "Email is required",
      "string.email": "Invalid email address",
    }),
  }),
});
