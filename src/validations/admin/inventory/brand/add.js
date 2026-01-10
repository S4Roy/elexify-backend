import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "Brand name is required",
      "string.min": "Brand name must be at least 2 characters",
      "string.max": "Brand name cannot exceed 100 characters",
    }),

    // slug: Joi.string()
    //   .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    //   .min(2)
    //   .max(100)
    //   .required()
    //   .messages({
    //     "string.empty": "Slug is required",
    //     "string.pattern.base":
    //       "Slug must contain only lowercase letters, numbers, and hyphens",
    //     "string.min": "Slug must be at least 2 characters",
    //     "string.max": "Slug cannot exceed 100 characters",
    //   }),

    description: Joi.string().max(500).optional().allow("").messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    parent_brand: Joi.string().optional().allow(null, "").messages({
      "string.base": "Parent brand must be a valid ID",
    }),

    image: Joi.string().uri().optional().allow(null, "").messages({
      "string.uri": "Image must be a valid URL",
    }),

    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
  }),
});
