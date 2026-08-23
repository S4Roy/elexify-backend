import { celebrate, Joi } from "celebrate";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export const reorder = celebrate({
  params: Joi.object({
    menuId: Joi.string().regex(objectIdPattern).required().messages({
      "string.pattern.base": "Invalid Menu ID format",
    }),
  }),
  body: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().regex(objectIdPattern).required().messages({
            "string.pattern.base": "Invalid item ID format",
            "any.required": "id is required for each item",
          }),
          parent_id: Joi.string()
            .regex(objectIdPattern)
            .optional()
            .allow(null, ""),
          order: Joi.number().integer().min(0).required().messages({
            "any.required": "order is required for each item",
          }),
        })
      )
      .min(1)
      .required()
      .messages({
        "array.min": "Items must have at least one entry",
        "any.required": "Items are required",
      }),
  }),
});
