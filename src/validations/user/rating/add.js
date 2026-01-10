import { celebrate, Joi } from "celebrate";

export const add = celebrate({
  body: Joi.object({
    // Required: Product being reviewed
    product_id: Joi.string().required().messages({
      "string.base": "Product ID must be a string",
      "any.required": "Product ID is required",
    }),

    // Optional: Variation
    variation_id: Joi.string().optional().allow(null, "").messages({
      "string.base": "Variation ID must be a string",
    }),

    // Rating (1–5)
    rating: Joi.number().integer().min(1).max(5).required().messages({
      "number.base": "Rating must be a number",
      "number.min": "Rating must be at least 1",
      "number.max": "Rating cannot exceed 5",
      "any.required": "Rating is required",
    }),

    // Review text
    description: Joi.string().max(2000).optional().allow(null, "").messages({
      "string.max": "Description cannot exceed 2000 characters",
    }),
    // Review title
    title: Joi.string().max(200).optional().allow(null, "").messages({
      "string.max": "Title cannot exceed 200 characters",
    }),

    // Media array (ObjectIds)
    media: Joi.array().items(Joi.string()).optional().messages({
      "array.base": "Media must be an array of IDs",
      "string.base": "Each media item must be a string",
    }),

    // Status (defaults to approved, but you can restrict if only admin sets it)
    status: Joi.string()
      .valid("pending", "approved", "rejected")
      .default("approved")
      .messages({
        "any.only": "Status must be 'pending', 'approved', or 'rejected'",
      }),
  }),
});
