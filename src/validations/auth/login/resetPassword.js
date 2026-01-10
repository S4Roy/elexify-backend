import { celebrate, Joi } from "celebrate";

export const resetPassword = celebrate({
  body: Joi.object({
    token: Joi.string().min(6).max(500).required().messages({
      "string.empty": "Token is required",
      "string.min": "Token must be at least 6 characters",
      "string.max": "Token cannot exceed 500 characters",
    }),

    new_password: Joi.string().min(8).max(30).required().messages({
      "string.empty": "New password is required",
      "string.min": "New password must be at least 8 characters",
      "string.max": "New password cannot exceed 30 characters",
    }),

    confirm_new_password: Joi.string()
      .valid(Joi.ref("new_password"))
      .required()
      .messages({
        "any.only": "Passwords do not match",
        "string.empty": "Confirm password is required",
      }),
  }),
});
