import { celebrate, Joi } from "celebrate";

export const changePassword = celebrate({
  body: Joi.object({
    old_password: Joi.string().required().messages({
      "string.empty": "Old password is required",
    }),

    new_password: Joi.string().min(6).max(72).required().messages({
      "string.empty": "New password is required",
      "string.min": "New password must be at least 6 characters",
    }),
  }),
});
