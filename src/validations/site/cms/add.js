import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    slug: Joi.string()
      .trim()
      .pattern(/^[a-z0-9-]+$/)
      .required()
      .messages({
        "string.empty": "Slug is required",
        "string.pattern.base":
          "Slug must contain only lowercase letters, numbers, and hyphens",
      }),

    title: Joi.string().trim().min(1).max(255).required().messages({
      "string.empty": "Page title is required",
      "string.min": "Page title must be at least 1 character",
      "string.max": "Page title cannot exceed 255 characters",
    }),

    content: Joi.string().allow(null, "").messages({
      "string.base": "Content must be a string",
    }),
  }),
});
