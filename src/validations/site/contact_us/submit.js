import { celebrate, Joi } from "celebrate";

export const submit = celebrate({
  body: Joi.object({
    name: Joi.string()
      .trim()
      .pattern(/^[a-zA-Z ]+$/)
      .required()
      .messages({
        "string.empty": "Name is required",
        "string.pattern.base": "Name must contain only letters and spaces",
      }),

    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/) // ✅ only digits, 10–15 length
      .required()
      .messages({
        "string.empty": "Phone number is required",
        "string.pattern.base":
          "Phone must contain only digits (10–15 digits allowed)",
      }),

    email: Joi.string().email().allow(null, "").optional().messages({
      "string.email": "Invalid email address",
    }),
    whatsapp_consent: Joi.boolean().allow(null, "").optional().messages({
      "boolean.base": "WhatsApp consent must be a boolean",
    }),

    subject: Joi.string().trim().required().messages({
      "string.empty": "Interest In is required",
    }),
    message: Joi.string().trim().optional(),
  }),
});
