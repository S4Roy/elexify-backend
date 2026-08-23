import { celebrate, Joi } from "celebrate";

const logoSchema = Joi.object({
  image: Joi.string().allow("", null).optional(),
  alt_text: Joi.string().allow("", null).optional(),
  link: Joi.string().allow("", null).optional(),
}).optional();

const logoMobileSchema = Joi.object({
  image: Joi.string().allow("", null).optional(),
  alt_text: Joi.string().allow("", null).optional(),
}).optional();

const backgroundSchema = Joi.object({
  type: Joi.string().valid("color", "transparent").optional(),
  color: Joi.string().allow("", null).optional(),
}).optional();

const visibilitySchema = Joi.object({
  show_topbar: Joi.boolean().optional(),
  show_search: Joi.boolean().optional(),
  show_wishlist: Joi.boolean().optional(),
  show_account: Joi.boolean().optional(),
  show_cart: Joi.boolean().optional(),
}).optional();

const ctaButtonSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  label: Joi.string().allow("", null).optional(),
  link: Joi.string().allow("", null).optional(),
  style: Joi.string().allow("", null).optional(),
}).optional();

const searchSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  placeholder: Joi.string().allow("", null).optional(),
  min_chars: Joi.number().integer().min(0).optional(),
}).optional();

export const update = celebrate({
  body: Joi.object({
    logo: logoSchema,
    logo_mobile: logoMobileSchema,
    layout: Joi.string().allow("", null).optional(),
    sticky: Joi.boolean().optional(),
    sticky_shrink_on_scroll: Joi.boolean().optional(),
    hide_on_scroll_down: Joi.boolean().optional(),
    height_px: Joi.number().optional(),
    height_mobile_px: Joi.number().optional(),
    background: backgroundSchema,
    visibility: visibilitySchema,
    cta_button: ctaButtonSchema,
    search: searchSchema,
  }),
});
