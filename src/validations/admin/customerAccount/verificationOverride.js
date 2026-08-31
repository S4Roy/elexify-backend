import { celebrate, Joi } from "celebrate";

export const verificationOverride = celebrate({
  body: Joi.object({
    channel: Joi.string().valid("email", "mobile").required(),
    reason: Joi.string().min(10).max(500).required().messages({
      "string.min": "Reason must be at least 10 characters",
      "string.empty": "A reason is required",
    }),
  }),
});
