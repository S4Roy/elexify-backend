import { celebrate, Joi } from "celebrate";
const urlOrPath = Joi.alternatives().try(
  Joi.string().uri({ scheme: ["http", "https"] }),
  Joi.string().pattern(/^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/) // allow internal paths like /category/men
);
export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Blog ID is required",
        "string.pattern.base": "Invalid Blog ID format",
      }),

    // Title (optional on edit)
    title: Joi.string().min(1).max(255).optional().allow("", null).messages({
      "string.min": "Title must be at least 1 character",
      "string.max": "Title cannot exceed 255 characters",
    }),

    short_description: Joi.string().max(500).allow("", null).optional(),

    // HTML content from editor
    content: Joi.string().allow("", null).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    related_blogs: Joi.array().items(Joi.string()).optional(),
    feature_image: Joi.string().allow(null, "").optional(),

    status: Joi.string()
      .valid("active", "inactive")
      .optional()
      .allow("", null)
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
  }),
});
