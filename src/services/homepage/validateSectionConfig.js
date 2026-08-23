import { Joi } from "celebrate";
import sanitizeHtml from "sanitize-html";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
// Same-site relative path or an https:// absolute url — rejects
// javascript:/data: schemes outright.
const safeLink = Joi.string()
  .max(500)
  .pattern(/^(\/[^\s]*|https:\/\/[^\s]+)$/)
  .message("must be a relative path or an https:// URL");

const ctaSchema = Joi.object({
  label: Joi.string().allow("", null).max(60),
  link: safeLink.allow("", null),
});

const slideSchema = Joi.object({
  desktop_image: objectId.allow(null, ""),
  mobile_image: objectId.allow(null, ""),
  heading: Joi.string().allow("", null).max(150),
  description: Joi.string().allow("", null).max(300),
  primary_cta: ctaSchema.optional(),
  secondary_cta: ctaSchema.optional(),
  overlay_opacity: Joi.number().min(0).max(1).optional(),
  order: Joi.number().optional(),
  enabled: Joi.boolean().optional(),
  schedule: Joi.object({
    startAt: Joi.date().allow(null),
    endAt: Joi.date().allow(null),
  }).optional(),
});

const CONFIG_SCHEMAS = {
  hero: Joi.object({
    slides: Joi.array().items(slideSchema).default([]),
  }),
  product_section: Joi.object({
    source_mode: Joi.string()
      .valid("manual", "category", "latest", "bestseller", "discounted", "featured")
      .default("latest"),
    product_ids: Joi.array().items(objectId).default([]),
    category_id: objectId.allow(null, ""),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sort_by: Joi.string().allow(null, ""),
    sort_order: Joi.number().valid(-1, 1).allow(null),
    view_all_link: safeLink.allow("", null),
    countdown_end_at: Joi.date().allow(null),
    badge_icon: Joi.string().allow(null, "").max(40),
  }),
  category_section: Joi.object({
    source_mode: Joi.string().valid("manual", "all").default("all"),
    category_ids: Joi.array().items(objectId).default([]),
    limit: Joi.number().integer().min(1).max(24).default(6),
  }),
  trust_badges: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          icon: Joi.string().max(40).required(),
          label: Joi.string().max(80).allow("", null),
          sub: Joi.string().max(120).allow("", null),
        }),
      )
      .default([]),
  }),
  cta_banner: Joi.object({
    heading: Joi.string().max(150).allow("", null),
    description: Joi.string().max(300).allow("", null),
    button_label: Joi.string().max(60).allow("", null),
    button_link: safeLink.allow("", null),
    show_newsletter_panel: Joi.boolean().default(false),
  }),
  content_section: Joi.object({
    heading: Joi.string().max(150).allow("", null),
    body: Joi.string().max(20000).allow("", null),
  }),
};

// Throws a Joi ValidationError on bad shape — callers wrap this in
// StatusError.badRequest(error.message).
export const validateSectionConfig = (type, config) => {
  const schema = CONFIG_SCHEMAS[type];
  if (!schema) {
    const error = new Error(`Unknown section type: ${type}`);
    error.name = "ValidationError";
    throw error;
  }
  const { error, value } = schema.validate(config || {}, { stripUnknown: true });
  if (error) throw error;

  if (type === "content_section" && value.body) {
    value.body = sanitizeHtml(String(value.body), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt", "title", "width", "height"],
        a: ["href", "name", "target", "rel"],
      },
    });
  }

  return value;
};

export const SECTION_TYPES = Object.keys(CONFIG_SCHEMAS);
