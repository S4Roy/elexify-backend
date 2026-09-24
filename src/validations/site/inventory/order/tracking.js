import { celebrate, Joi } from "celebrate";

export const tracking = celebrate({
  query: Joi.object({
    order_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({ "string.pattern.base": "Invalid Order ID format", "any.required": "Order ID is required" }),
  }).unknown(true),
});

// Public /track-order lookup: the order number plus the email or mobile
// number used on the order — both must match (see controllers/site/
// inventory/order/tracking.js).
export const trackPublic = celebrate({
  body: Joi.object({
    order_number: Joi.string().trim().max(40).required().messages({
      "string.empty": "Enter your order number",
      "any.required": "Enter your order number",
    }),
    contact: Joi.string().trim().max(254).required().messages({
      "string.empty": "Enter the email or mobile number used for the order",
      "any.required": "Enter the email or mobile number used for the order",
    }),
    recaptcha_token: Joi.string().allow("", null).optional(),
  }),
});
