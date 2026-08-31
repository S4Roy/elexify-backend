import { celebrate, Joi } from "celebrate";

const bool = Joi.boolean();

export const updateNotificationPreferences = celebrate({
  body: Joi.object({
    transactional: Joi.object({
      order_email: bool,
      order_sms: bool,
      order_whatsapp: bool,
      payment_email: bool,
      payment_sms: bool,
      refund_email: bool,
      refund_sms: bool,
    }).optional(),
    security: Joi.object({
      email: bool,
      sms: bool,
    }).optional(),
    marketing: Joi.object({
      email: bool,
      sms: bool,
      whatsapp: bool,
    }).optional(),
    reminders: Joi.object({
      abandoned_cart_email: bool,
      abandoned_cart_whatsapp: bool,
      wishlist_email: bool,
    }).optional(),
  }),
});
