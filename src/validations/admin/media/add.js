import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    file: Joi.string().uri().optional().allow(null, "").messages({
      "string.uri": "File must be a valid URL",
    }),
    file_name: Joi.string().optional().allow(null, "").messages({
      "string.empty": "File name is required",
      "string.min": "File name must be at least 1 character",
      "string.max": "File name cannot exceed 255 characters",
    }),
    ref_type: Joi.string()
      .valid(
        "products",
        "categories",
        "attributes",
        "brands",
        "users",
        "blogs",
        "why-choose-us"
      )
      .required()
      .messages({
        "any.only":
          "Reference type must be one of 'products', 'categories', 'attributes', 'brands', or 'users'",
        "string.empty": "Reference type is required",
      }),
    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .optional()
      .allow(null, "")
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),
  }),
});
