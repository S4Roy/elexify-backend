import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "ContactUs ID is required",
        "string.pattern.base": "Invalid ContactUs ID format",
      }),

    status: Joi.string()
      .valid("pending", "answered", "archived", "spam")
      .optional()
      .messages({
        "any.only": "Invalid enquiry status",
      }),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  }),
});
