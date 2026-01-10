import { celebrate, Joi } from "celebrate";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdOrUri = Joi.alternatives().try(
  Joi.string().regex(objectIdRegex).messages({
    "string.pattern.base": "Image id must be a 24 character hex string",
  }),
  Joi.string().uri().messages({
    "string.uri": "Image must be a valid URL",
  })
);

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string().regex(objectIdRegex).required().messages({
      "string.empty": "Attribute ID is required",
      "string.pattern.base": "Invalid Attribute ID format",
    }),
    visible_in_list: Joi.boolean().optional(),
    size_meta: Joi.boolean().optional(),
    customized_mala_mukhi: Joi.boolean().optional(),
    customized_mala_design: Joi.boolean().optional(),
    customized_mala_type: Joi.boolean().optional(),

    name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "Attribute name is required",
      "string.min": "Attribute name must be at least 2 characters",
      "string.max": "Attribute name cannot exceed 100 characters",
    }),

    description: Joi.string().max(500).optional().allow(null, "").messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    // Accept either a media ObjectId (hex 24) or a URI
    image: objectIdOrUri.optional().allow(null, ""),

    display_type: Joi.string()
      .valid("dropdown", "radio", "image")
      .optional()
      .messages({
        "any.only":
          "display_type must be one of 'dropdown', 'radio' or 'image'",
      }),

    values_sort_by: Joi.string().valid("sort_order", "name").optional(),

    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),

    values: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().regex(objectIdRegex).optional().messages({
            "string.pattern.base": "Invalid Value ID format",
          }),

          // Accept either `name` (preferred) or `value` (backwards compat)
          name: Joi.string().min(1).max(100).messages({
            "string.empty": "Attribute value name is required",
            "string.min": "Value must be at least 1 character",
            "string.max": "Value cannot exceed 100 characters",
          }),

          value: Joi.string().min(1).max(100).messages({
            "string.empty": "Attribute value is required",
            "string.min": "Value must be at least 1 character",
            "string.max": "Value cannot exceed 100 characters",
          }),

          visible_in_list: Joi.boolean().optional(),

          description: Joi.string()
            .max(500)
            .optional()
            .allow(null, "")
            .messages({
              "string.max": "Description cannot exceed 500 characters",
            }),

          // color hex like #ff0000 (optional)
          hex: Joi.string()
            .pattern(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
            .optional()
            .allow(null, "")
            .messages({
              "string.pattern.base":
                "hex must be a valid color code like #ff0000",
            }),

          // image may be media id (ObjectId) or URL
          image: objectIdOrUri.optional().allow(null, ""),
          url: Joi.optional(),

          sort_order: Joi.number().integer().min(0).optional().default(0),

          status: Joi.string()
            .valid("active", "inactive")
            .default("active")
            .messages({
              "any.only": "Status must be either 'active' or 'inactive'",
            }),

          meta: Joi.object().optional().allow(null),
          // ----------------------------
          // ⭐ NEW PRICE FIELDS ⭐
          // ----------------------------
          price_modifier: Joi.number().min(0).precision(2).default(0).messages({
            "number.base": "price_modifier must be a number",
            "number.min": "price_modifier must be 0 or greater",
          }),

          price_type: Joi.string()
            .valid("fixed", "percent")
            .default("fixed")
            .messages({
              "any.only": "price_type must be either 'fixed' or 'percent'",
            }),
        })
          // require at least one of `name` or `value` to be present
          .or("name", "value")
      )
      .optional()
      .messages({
        "array.base": "Values must be an array of objects",
      }),
  }),
});
