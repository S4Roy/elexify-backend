import { celebrate, Joi } from "celebrate";

const bool = Joi.boolean();

// .unknown(true) throughout — see the matching comment in
// validations/user/account/notificationPreferences.js: the admin UI PATCHes
// back the full doc it fetched via GET, read-only fields included.
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
    }).unknown(true).optional(),
    security: Joi.object({ email: bool, sms: bool }).unknown(true).optional(),
    marketing: Joi.object({ email: bool, sms: bool, whatsapp: bool }).unknown(true).optional(),
    reminders: Joi.object({
      abandoned_cart_email: bool,
      abandoned_cart_whatsapp: bool,
      wishlist_email: bool,
    }).unknown(true).optional(),
  }).unknown(true),
});
