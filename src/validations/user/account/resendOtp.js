import { celebrate, Joi } from "celebrate";

export const resendOtp = celebrate({
  body: Joi.object({
    purpose: Joi.string().valid("change_email", "change_mobile").required(),
  }),
});
