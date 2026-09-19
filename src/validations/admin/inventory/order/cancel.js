import { celebrate, Joi } from "celebrate";
import { CANCELLATION_REASONS } from "../../../../constants/orderStatus.js";

export const cancel = celebrate({
  body: Joi.object({
    order_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Order ID is required",
        "string.pattern.base": "Invalid Order ID format",
      }),
    reason: Joi.string()
      .valid(...CANCELLATION_REASONS)
      .required()
      .messages({
        "any.only": "Please select a valid cancellation reason",
        "string.empty": "Reason for cancellation is required",
      }),
    comment: Joi.string()
      .max(500)
      .allow("")
      .when("reason", {
        is: "Other",
        then: Joi.string().required().messages({
          "string.empty": "Please tell us the reason",
        }),
        otherwise: Joi.optional(),
      }),
  }),
});

// Force-cancel always takes a free-text reason rather than the preset
// CANCELLATION_REASONS list — it's an exceptional override, not a routine
// customer-facing cancellation reason.
export const forceCancel = celebrate({
  body: Joi.object({
    order_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Order ID is required",
        "string.pattern.base": "Invalid Order ID format",
      }),
    reason: Joi.string()
      .trim()
      .min(10)
      .max(500)
      .required()
      .messages({
        "string.empty": "A reason is required to force-cancel an order",
        "string.min": "Please explain why this order needs to be force-cancelled (min 10 characters)",
      }),
  }),
});

export const retryRefund = celebrate({
  body: Joi.object({
    order_id: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.empty": "Order ID is required",
        "string.pattern.base": "Invalid Order ID format",
      }),
  }),
});
