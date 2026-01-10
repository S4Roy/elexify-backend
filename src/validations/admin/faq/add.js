import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    _id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional()
      .allow(null, "")
      .messages({
        "string.pattern.base": "Invalid FAQ ID format",
      }),

    question: Joi.string().trim().min(5).max(300).required().messages({
      "string.empty": "Question is required",
      "string.min": "Question must be at least 5 characters",
      "string.max": "Question cannot exceed 300 characters",
    }),

    answer: Joi.string().trim().min(5).max(2000).required().messages({
      "string.empty": "Answer is required",
      "string.min": "Answer must be at least 5 characters",
      "string.max": "Answer cannot exceed 2000 characters",
    }),

    category: Joi.string().trim().max(100).allow(null, "").messages({
      "string.max": "Category cannot exceed 100 characters",
    }),

    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
