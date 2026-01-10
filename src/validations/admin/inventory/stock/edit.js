import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Category ID is required",
        "string.pattern.base": "Invalid Category ID format",
      }),

    name: Joi.string().min(2).max(100).optional().allow("", null).messages({
      "string.min": "Category name must be at least 2 characters",
      "string.max": "Category name cannot exceed 100 characters",
    }),

    // slug: Joi.string()
    //   .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    //   .min(2)
    //   .max(100)
    //   .optional()
    //   .allow("", null)
    //   .messages({
    //     "string.pattern.base":
    //       "Slug must contain only lowercase letters, numbers, and hyphens",
    //     "string.min": "Slug must be at least 2 characters",
    //     "string.max": "Slug cannot exceed 100 characters",
    //   }),

    description: Joi.string().max(10000).optional().allow("", null).messages({
      "string.max": "Description cannot exceed 10000 characters",
    }),

    category: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional()
      .allow("", null)
      .messages({
        "string.pattern.base": "Category must be a valid ID",
      }),

    images: Joi.alternatives()
      .try(
        Joi.array().items(
          Joi.string().uri().messages({
            "string.uri": "Each image must be a valid URL",
          })
        ),
        Joi.string().valid(""), // Allow empty string
        Joi.allow(null) // Allow null
      )
      .optional()
      .messages({
        "array.base": "Images must be an array of valid URLs",
      }),

    status: Joi.string()
      .valid("active", "inactive")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
    meta_title: Joi.string().max(255).optional().allow("", null).messages({
      "string.max": "Meta title cannot exceed 255 characters",
    }),

    meta_description: Joi.string()
      .max(1000)
      .optional()
      .allow("", null)
      .messages({
        "string.max": "Meta description cannot exceed 1000 characters",
      }),

    meta_keywords: Joi.string().optional().allow("", null).messages({
      "string.base": "Meta keywords must be a string",
    }),
  }),
});
