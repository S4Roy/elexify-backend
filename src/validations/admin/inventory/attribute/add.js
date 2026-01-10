import { celebrate, Joi } from "celebrate";

const objectIdOrUri = Joi.alternatives().try(
  Joi.string().hex().length(24), // mongo ObjectId as hex string
  Joi.string().uri() // or a URI
);

export const add = celebrate({
  body: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      "string.empty": "Attribute name is required",
      "string.min": "Attribute name must be at least 2 characters",
      "string.max": "Attribute name cannot exceed 100 characters",
    }),
    visible_in_list: Joi.boolean().optional(),
    size_meta: Joi.boolean().optional(),
    customized_mala_mukhi: Joi.boolean().optional(),
    customized_mala_design: Joi.boolean().optional(),
    customized_mala_type: Joi.boolean().optional(),

    description: Joi.string().max(500).optional().allow(null, "").messages({
      "string.max": "Description cannot exceed 500 characters",
    }),

    // Accept either a media ObjectId (hex 24) or a URI (flexible for your upload flow)
    image: objectIdOrUri.optional().allow(null, "").messages({
      "string.uri": "Image must be a valid URL",
      "string.length": "Image id must be a 24 character hex string",
    }),

    display_type: Joi.string()
      .valid("dropdown", "radio", "image")
      .default("dropdown")
      .messages({
        "any.only":
          "display_type must be one of 'dropdown', 'radio' or 'image'",
      }),

    values_sort_by: Joi.string()
      .valid("sort_order", "name")
      .default("sort_order"),

    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .messages({
        "any.only": "Status must be either 'active' or 'inactive'",
      }),

    values: Joi.array()
      .items(
        Joi.object({
          // Accept either `name` (preferred) or `value` (backwards compat).
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
          visible_in_list: Joi.boolean().optional(),

          // image may be media id (ObjectId) or URL
          image: objectIdOrUri.optional().allow(null, "").messages({
            "string.uri": "Image must be a valid URL",
            "string.length": "Image id must be a 24 character hex string",
          }),
          url: Joi.optional(),
          sort_order: Joi.number().integer().min(0).default(0),

          status: Joi.string()
            .valid("active", "inactive")
            .default("active")
            .messages({
              "any.only": "Status must be either 'active' or 'inactive'",
            }),

          meta: Joi.object().optional().allow(null),
          // --- NEW: price modifier fields for attribute value ---
          // price_modifier: number (>= 0). Can be used as absolute or percent depending on price_type.
          price_modifier: Joi.number().min(0).precision(2).default(0).messages({
            "number.base": "price_modifier must be a number",
            "number.min": "price_modifier must be 0 or greater",
          }),

          // price_type: 'fixed' => add absolute amount; 'percent' => percentage of base price
          price_type: Joi.string()
            .valid("fixed", "percent")
            .default("fixed")
            .messages({
              "any.only": "price_type must be either 'fixed' or 'percent'",
            }),

          // // optional: allow per-value SKU override (string) and qty constraints
          // sku: Joi.string().optional().allow(null, "").messages({
          //   "string.base": "sku must be a string",
          // }),
          // min_qty: Joi.number().integer().min(1).optional().messages({
          //   "number.base": "min_qty must be a positive integer",
          //   "number.min": "min_qty must be at least 1",
          // }),
          // max_qty: Joi.number().integer().min(1).optional().messages({
          //   "number.base": "max_qty must be a positive integer",
          //   "number.min": "max_qty must be at least 1",
          // }),
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
