import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    first_name: Joi.string().min(2).max(100).required().messages({
      "string.base": "First name must be a string",
      "string.empty": "First name is required",
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name cannot exceed 100 characters",
    }),

    last_name: Joi.string().min(2).max(100).required().messages({
      "string.base": "Last name must be a string",
      "string.empty": "Last name is required",
      "string.min": "Last name must be at least 2 characters",
      "string.max": "Last name cannot exceed 100 characters",
    }),

    email: Joi.string().email().required().messages({
      "string.base": "Email must be a string",
      "string.empty": "Email is required",
      "string.email": "Email must be a valid email address",
    }),

    phone: Joi.string()
      .pattern(/^[6-9]\d{9}$/)
      .optional()
      .allow(null, "")
      .messages({
        "string.pattern.base":
          "Phone number must be a valid 10-digit Indian mobile number",
      }),

    password: Joi.string().min(6).max(50).optional().allow("", null).messages({
      "string.min": "Password must be at least 6 characters long",
      "string.max": "Password cannot exceed 50 characters",
    }),

    confirm_password: Joi.string()
      .when("password", {
        is: Joi.exist(),
        then: Joi.required().valid(Joi.ref("password")),
        otherwise: Joi.optional().allow("", null),
      })
      .messages({
        "any.only": "Confirm password must match password",
        "any.required":
          "Confirm password is required when password is provided",
      }),
  }),
});
