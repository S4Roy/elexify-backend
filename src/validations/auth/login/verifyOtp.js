import { celebrate, Joi, Segments } from "celebrate";

export const verifyOtp = celebrate({
  [Segments.BODY]: Joi.object({
    // ── Identity — email OR mobile ────────────────────────────────────────────
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

    // ── OTP ───────────────────────────────────────────────────────────────────
    otp: Joi.string()
      .length(6)
      .pattern(/^[0-9]{6}$/)
      .required()
      .messages({
        "string.empty": "OTP is required",
        "string.length": "OTP must be exactly 6 digits",
        "string.pattern.base": "OTP must contain only digits",
      }),

    // ── Purpose ───────────────────────────────────────────────────────────────
    purpose: Joi.string()
      .valid("auth", "signup", "forgot_password", "reset_password")
      .default("auth")
      .messages({
        "any.only":
          "Purpose must be one of: auth, signup, forgot_password, reset_password",
      }),

    // ── New user fields (optional — only for signup) ───────────────────────────
    first_name: Joi.string().trim().max(50).optional().allow(""),
    last_name: Joi.string().trim().max(50).optional().allow(""),

    is_otp_login: Joi.boolean().default(false),
  })
    .or("email", "mobile")
    .messages({
      "object.missing": "Either email or mobile number is required",
    }),
});
