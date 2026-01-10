import { celebrate, Joi } from "celebrate";
const urlOrPath = Joi.alternatives().try(
  Joi.string().uri({ scheme: ["http", "https"] }),
  Joi.string().pattern(/^\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/) // allow internal paths like /category/men
);
export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Banner ID is required",
        "string.pattern.base": "Invalid Banner ID format",
      }),

    title: Joi.string().min(2).max(100).optional().allow("", null).messages({
      "string.empty": "Title is required",
      "string.max": "Title cannot exceed 255 characters",
    }),

    description: Joi.string().allow(null, "").optional(),

    cta_label: Joi.string().allow(null, "").max(100).optional().messages({
      "string.max": "CTA label cannot exceed 100 characters",
    }),

    cta_link: urlOrPath.allow(null, "").optional().messages({
      "string.uri": "CTA link must be a valid URL",
      "string.pattern.base":
        "CTA link must be a valid absolute URL or start with '/'",
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
