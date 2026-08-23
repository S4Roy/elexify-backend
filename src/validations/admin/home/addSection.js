import { celebrate, Joi } from "celebrate";

const SECTION_TYPES = [
  "hero",
  "product_section",
  "category_section",
  "trust_badges",
  "cta_banner",
  "content_section",
];

export const addSection = celebrate({
  body: Joi.object({
    type: Joi.string().valid(...SECTION_TYPES).required(),
    title: Joi.string().allow("", null).max(150),
    subtitle: Joi.string().allow("", null).max(300),
    enabled: Joi.boolean().optional(),
    order: Joi.number().optional(),
    config: Joi.object().unknown(true).default({}),
    schedule: Joi.object({
      startAt: Joi.date().allow(null),
      endAt: Joi.date().allow(null),
    }).optional(),
  }),
});
