import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    first_name: Joi.string().min(2).max(100).optional().messages({
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name cannot exceed 100 characters",
    }),

    last_name: Joi.string().min(1).max(100).optional().allow("").messages({
      "string.max": "Last name cannot exceed 100 characters",
    }),

    dob: Joi.date().max("now").optional().allow(null, "").messages({
      "date.max": "Date of birth cannot be in the future",
    }),

    gender: Joi.string()
      .valid("male", "female", "other")
      .optional()
      .allow(null, ""),

    profile_image: Joi.string().uri().optional().allow(null, ""),

    current_password: Joi.string().optional().allow("", null),

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
        "any.required": "Confirm password is required when password is provided",
      }),
  }),
});
