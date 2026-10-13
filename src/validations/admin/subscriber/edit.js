import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    // Admins can stop marketing; a new opt-in must come from the customer.
    status: Joi.string().valid("unsubscribed", "suppressed").required(),
  }),
});
