import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional()
      .allow(null, "")
      .messages({
        "string.pattern.base": "Invalid Testimonial ID format",
      }),

    name: Joi.string().trim().min(2).max(100).required().messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 2 characters",
      "string.max": "Name cannot exceed 100 characters",
    }),

    designation: Joi.string().trim().max(100).allow(null, "").messages({
      "string.max": "Designation cannot exceed 100 characters",
    }),

    message: Joi.string().trim().min(5).max(1000).required().messages({
      "string.empty": "Message is required",
      "string.min": "Message must be at least 5 characters",
      "string.max": "Message cannot exceed 1000 characters",
    }),

    rating: Joi.number().integer().min(1).max(5).default(5).messages({
      "number.base": "Rating must be a number",
      "number.min": "Rating must be at least 1",
      "number.max": "Rating cannot exceed 5",
    }),

    image: Joi.string().uri().allow(null, "").messages({
      "string.uri": "Image must be a valid URL",
    }),

    source: Joi.string()
      .valid("google", "website", "manual")
      .default("manual")
      .messages({
        "any.only": "Source must be one of 'google', 'website', or 'manual'",
      }),

    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
