import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Specification ID is required",
        "string.pattern.base": "Invalid Specification ID format",
      }),

    // optional fields
    label: Joi.string().trim().min(2).max(200).optional(),

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
      .optional(),

    unit: Joi.string().trim().max(32).optional().allow(null, ""),

    options: Joi.array().items(Joi.any()).optional().default([]),

    validation: Joi.object({
      min: Joi.number(),
      max: Joi.number(),
      step: Joi.number(),
      regex: Joi.string(),
      custom: Joi.object(),
    }).optional(),

    group: Joi.string().trim().max(100).optional().allow(null, ""),
    sort_order: Joi.number().integer().min(0).optional(),
    visible: Joi.boolean().optional(),
    required: Joi.boolean().optional(),

    // required field
    status: Joi.string().valid("active", "inactive").required(),
  }),
});
