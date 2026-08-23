import { celebrate, Joi } from "celebrate";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const scheduleSchema = Joi.object({
  startAt: Joi.date().allow(null),
  endAt: Joi.date().allow(null),
}).allow(null);

const badgeSchema = Joi.object({
  text: Joi.string().allow("", null),
  color: Joi.string().allow("", null),
}).allow(null);

const megaMenuLinkSchema = Joi.object({
  label: Joi.string().required(),
  type: Joi.string()
    .valid("category", "product", "custom_url", "internal_page")
    .required(),
  reference_id: Joi.string().regex(objectIdPattern).optional().allow(null, ""),
  custom_url: Joi.string().optional().allow(null, ""),
  order: Joi.number().integer().optional(),
  badge: badgeSchema,
});

const megaMenuColumnSchema = Joi.object({
  heading: Joi.string().allow("", null).optional(),
  order: Joi.number().integer().optional(),
  links: Joi.array().items(megaMenuLinkSchema).optional(),
});

const megaMenuPromoSchema = Joi.object({
  image: Joi.string().allow("", null).optional(),
  heading: Joi.string().allow("", null).optional(),
  subtext: Joi.string().allow("", null).optional(),
  link: Joi.string().allow("", null).optional(),
  order: Joi.number().integer().optional(),
}).allow(null);

const megaMenuContentSchema = Joi.object({
  layout: Joi.string().allow("", null).optional(),
  columns: Joi.array().items(megaMenuColumnSchema).optional(),
  promo: megaMenuPromoSchema,
}).unknown(true);

const TYPES_REQUIRING_REFERENCE = [
  "internal_page",
  "product",
  "category",
  "collection",
  "blog",
];
const TYPES_REQUIRING_CUSTOM_URL = ["custom_url", "external_url", "cta"];

export const edit = celebrate({
  params: Joi.object({
    menuId: Joi.string().regex(objectIdPattern).required().messages({
      "string.pattern.base": "Invalid Menu ID format",
    }),
    id: Joi.string().regex(objectIdPattern).required().messages({
      "string.pattern.base": "Invalid Menu Item ID format",
    }),
  }),
  body: Joi.object({
    parent_id: Joi.string().regex(objectIdPattern).optional().allow(null, ""),
    type: Joi.string()
      .valid(
        "internal_page",
        "product",
        "category",
        "collection",
        "blog",
        "custom_url",
        "external_url",
        "mega_menu",
        "dropdown",
        "cta"
      )
      .optional(),
    label: Joi.string().optional(),
    icon: Joi.string().allow("", null).optional(),
    badge: badgeSchema,
    // reference_id / custom_url are only strictly required when `type` is
    // supplied in this same request and demands one of them — a partial
    // update that doesn't touch `type` can send either field freely.
    reference_id: Joi.string()
      .regex(objectIdPattern)
      .when("type", {
        is: Joi.valid(...TYPES_REQUIRING_REFERENCE),
        then: Joi.required(),
        otherwise: Joi.optional().allow(null, ""),
      }),
    custom_url: Joi.string().when("type", {
      is: Joi.valid(...TYPES_REQUIRING_CUSTOM_URL),
      then: Joi.required(),
      otherwise: Joi.optional().allow(null, ""),
    }),
    target: Joi.string().valid("_self", "_blank").optional(),
    order: Joi.number().integer().optional(),
    enabled: Joi.boolean().optional(),
    schedule: scheduleSchema.optional(),
    mega_menu_content: megaMenuContentSchema.optional(),
  }),
});
