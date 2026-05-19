import { celebrate, Joi, Segments } from "celebrate";

export const sendOtp = celebrate({
  [Segments.BODY]: Joi.object({
    // ── Email OR mobile — exactly one must be provided ────────────────────────
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .lowercase()
      .trim()
      .messages({
        "string.email": "Enter a valid email address",
      }),

    mobile: Joi.string()
      .pattern(/^[0-9]{6,15}$/)
      .trim()
      .messages({
        "string.pattern.base": "Mobile number must be 6–15 digits",
      }),

    phone_code: Joi.string()
      .pattern(/^[0-9]{1,4}$/)
      .default("91")
      .messages({
        "string.pattern.base": "Phone code must be numeric (1–4 digits)",
      }),

    purpose: Joi.string()
      .valid("auth", "signup", "forgot_password", "reset_password")
      .default("auth")
      .messages({
        "any.only":
          "Purpose must be one of: auth, signup, forgot_password, reset_password",
      }),

    is_otp_login: Joi.boolean().default(false),
  })
    .or("email", "mobile") // at least one required
    .messages({
      "object.missing": "Either email or mobile number is required",
    }),
});
