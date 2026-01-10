import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    title: Joi.string().min(1).max(255).required().messages({
      "string.empty": "Title is required",
      "string.max": "Title cannot exceed 255 characters",
    }),
    short_description: Joi.string().allow(null, "").optional(),
    content: Joi.string().allow(null, "").optional(),
    feature_image: Joi.string().allow(null, "").optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    related_blogs: Joi.array().items(Joi.string()).optional(),
    status: Joi.string()
      .valid("active", "inactive")
      .default("active")
      .optional(),
  }),
});
