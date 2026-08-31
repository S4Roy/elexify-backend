import { celebrate, Joi } from "celebrate";

const bool = Joi.boolean();

// .unknown(true) throughout: the storefront/admin UIs both fetch the
// current preferences doc (GET), let the user toggle a field, and PATCH
// the whole object back — which naturally still carries read-only fields
// like _id/user_id/created_at/updated_at from the GET response. Reject
// nothing here except genuinely malformed boolean values; the controller
// only ever reads the four known group keys anyway.
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
    security: Joi.object({
      email: bool,
      sms: bool,
    }).unknown(true).optional(),
    marketing: Joi.object({
      email: bool,
      sms: bool,
      whatsapp: bool,
    }).unknown(true).optional(),
    reminders: Joi.object({
      abandoned_cart_email: bool,
      abandoned_cart_whatsapp: bool,
      wishlist_email: bool,
    }).unknown(true).optional(),
  }).unknown(true),
});
