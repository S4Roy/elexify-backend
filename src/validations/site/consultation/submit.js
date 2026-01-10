import { celebrate, Joi } from "celebrate";

export const submit = celebrate({
  body: Joi.object({
    type: Joi.string().valid("Rudraksha", "Astro").required(),

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

    email: Joi.string().email().optional().allow(null, "").messages({
      "string.email": "Invalid email address",
    }),

    gender: Joi.string().valid("male", "female", "other").required(),

    dob: Joi.date().required().messages({
      "date.base": "Date of birth must be a valid date",
      "any.required": "Date of birth is required",
    }),

    time: Joi.string().required().messages({
      "string.empty": "Birth time is required",
    }),

    place: Joi.string().trim().required().messages({
      "string.empty": "Place of birth is required",
    }),
    postcode: Joi.string().trim().optional().allow(null, ""),
    occupation: Joi.string().trim().optional().allow(null, ""),
    current_address: Joi.string().trim().optional().allow(null, ""),
    currency: Joi.string().trim().optional().allow(null, ""),

    purpose: Joi.string().trim().required().messages({
      "string.empty": "Purpose is required",
    }),
  }),
});
