import { celebrate, Joi } from "celebrate";

export const update = celebrate({
  params: Joi.object({
    product_id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  }),
  body: Joi.object({
    // Industry-standard SEO length caps, mirrored in models/SEO.js:
    // - meta_title/og_title/twitter_title: Google SERPs truncate around
    //   55-60 chars; Twitter Cards truncate titles at 70.
    // - meta_description/og_description/twitter_description: Google
    //   truncates snippets around 155-160 chars; social previews allow a
    //   bit more room before their own truncation kicks in (~200).
    meta_title: Joi.string().max(60).allow("", null).optional(),
    meta_description: Joi.string().max(160).allow("", null).optional(),
    meta_keywords: Joi.string().max(500).allow("", null).optional(),
    focus_keyword: Joi.string().max(100).allow("", null).optional(),
    // Stored as a site-relative path (e.g. "/product/{slug}/"), not an
    // absolute URI — see services/seo/generateProductSEO.js — so no .uri()
    // check here, just a sane length cap.
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
