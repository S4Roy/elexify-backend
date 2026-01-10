import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Brand ID is required",
        "string.pattern.base": "Invalid Brand ID format",
      }),

    name: Joi.string().min(2).max(100).optional().allow("", null).messages({
      "string.min": "Brand name must be at least 2 characters",
      "string.max": "Brand name cannot exceed 100 characters",
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

    description: Joi.string().max(500).optional().allow("", null).messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    parent_brand: Joi.string().optional().allow("", null).messages({
      "string.pattern.base": "Parent brand must be a valid ID",
    }),

    image: Joi.any().optional().messages({
      "any.only": "Invalid image format",
    }),

    status: Joi.string()
      .valid("active", "inactive")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
  }),
});
