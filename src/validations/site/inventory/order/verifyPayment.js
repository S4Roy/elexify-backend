import { celebrate, Joi } from "celebrate";

export const verifyPayment = celebrate({
  body: Joi.object({
    razorpay_payment_id: Joi.string().trim().required(),
    razorpay_order_id: Joi.string().trim().required(),
    razorpay_signature: Joi.string().hex().length(64).required(),
    order_id: Joi.string().trim().required(),
  }),
});
