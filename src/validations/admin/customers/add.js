import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 2 characters",
    }),

    email: Joi.string().email().lowercase().trim().optional().messages({
      "string.email": "Enter a valid email address",
    }),

    phone_code: Joi.string().max(5).optional().default("91"),

    mobile: Joi.string()
      .pattern(/^[0-9]{6,15}$/)
      .optional()
      .messages({
        "string.pattern.base": "Enter a valid mobile number",
      }),

    password: Joi.string().min(6).max(30).optional().messages({
      "string.min": "Password must be at least 6 characters",
    }),

    status: Joi.string().valid("active", "inactive").default("active"),
  })
    .or("email", "mobile")
    .messages({
      "object.missing": "Email or mobile number is required",
    }),
});
