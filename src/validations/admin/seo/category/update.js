import { celebrate, Joi } from "celebrate";

export const update = celebrate({
  params: Joi.object({
    category_id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object({
    meta_title: Joi.string().max(60).allow("", null).optional(),
    meta_description: Joi.string().max(160).allow("", null).optional(),
    meta_keywords: Joi.string().max(500).allow("", null).optional(),
    focus_keyword: Joi.string().max(100).allow("", null).optional(),
    canonical_url: Joi.string().max(2048).allow("", null).optional(),
    robots: Joi.string()
      .valid("index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow")
      .optional(),
    og_title: Joi.string().max(70).allow("", null).optional(),
    og_description: Joi.string().max(200).allow("", null).optional(),
    og_image: Joi.string().allow("", null).optional(),
    twitter_title: Joi.string().max(70).allow("", null).optional(),
    twitter_description: Joi.string().max(200).allow("", null).optional(),
    twitter_image: Joi.string().allow("", null).optional(),
    schema_enabled: Joi.boolean().optional(),
  }),
});
