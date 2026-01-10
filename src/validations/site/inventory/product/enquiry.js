import { celebrate, Joi, Segments } from "celebrate";

export const enquiry = celebrate({
  [Segments.BODY]: Joi.object({
    // Product ID is always required
    product_id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Product ID is required",
        "string.pattern.base": "Invalid Product ID format",
      }),

    // Variation ID is optional
    variation_id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .allow(null, "")
      .messages({
        "string.pattern.base": "Invalid Variation ID format",
      }),

    // Product snapshot fields (optional, helpful if product is deleted later)
    product_name: Joi.string().max(255).allow(null, ""),
    product_sku: Joi.string().max(100).allow(null, ""),

    // Guest user fields (required if not logged in — your controller can decide)
    name: Joi.string().max(200).when("user_id", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),

    email: Joi.string().email().allow(null, "").optional().messages({
      "string.email": "Invalid email address",
    }),
    whatsapp_consent: Joi.boolean().allow(null, "").optional().messages({
      "boolean.base": "WhatsApp consent must be a boolean",
    }),

    mobile: Joi.string()
      .pattern(/^[0-9+\-()\s]{6,20}$/)
      .when("user_id", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required(),
      })
      .messages({
        "string.pattern.base": "Invalid mobile number format",
      }),

    // Enquiry content
    message: Joi.string().max(8000).required().messages({
      "string.empty": "Message is required",
    }),

    // Type of enquiry
    type: Joi.string()
      .valid("ask_price", "enquiry", "stock_check", "custom_request")
      .default("ask_price"),

    // Optional meta (for tracking / analytics)
    source: Joi.string().max(50).allow(null, ""),
    channel: Joi.string().valid("web", "android", "ios").default("web"),
  }),
});
