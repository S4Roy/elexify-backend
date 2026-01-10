import { celebrate, Joi, Segments } from "celebrate";

export const add = celebrate({
  [Segments.BODY]: Joi.object({
    label: Joi.string().trim().min(2).max(200).required().messages({
      "string.empty": "Label is required",
    }),

    type: Joi.string()
      .valid(
        "text",
        "number",
        "dropdown",
        "boolean",
        "multiselect",
        "date",
        "richtext"
      )
      .required(),

    unit: Joi.string().trim().max(32).optional().allow(null, ""),

    options: Joi.array()
      .items(
        Joi.string().trim().min(1).max(100).messages({
          "string.empty": "Option value cannot be empty",
          "string.min": "Option must be at least 1 character",
          "string.max": "Option cannot exceed 100 characters",
        })
      )
      .when("type", {
        is: Joi.valid("dropdown", "multiselect"),
        then: Joi.array().min(1).required().messages({
          "array.min": "Options must have at least one entry",
          "any.required": "Options are required for dropdown/multiselect types",
        }),
        otherwise: Joi.optional().default([]),
      }),

    validation: Joi.object({
      min: Joi.number(),
      max: Joi.number(),
      step: Joi.number(),
      regex: Joi.string(),
      custom: Joi.object(),
    }).optional(),

    group: Joi.string().trim().max(100).optional().allow(null, ""),
    sort_order: Joi.number().integer().min(0).default(0),
    visible: Joi.boolean().default(true),
    required: Joi.boolean().default(false),

    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
