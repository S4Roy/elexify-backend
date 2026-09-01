import { celebrate, Joi } from "celebrate";

export const update = celebrate({
  body: Joi.object({
    subject: Joi.string().min(1).max(200).required(),
    preheader: Joi.string().allow("").max(200).default(""),
    body: Joi.string().min(1).required(),
    status: Joi.string().valid("active", "inactive"),
  }),
});

export const resetToDefault = celebrate({
  body: Joi.object({
    confirm: Joi.boolean().valid(true).required(),
  }),
});

export const sendTest = celebrate({
  body: Joi.object({
    email: Joi.string().email().required(),
  }),
});

export const preview = celebrate({
  // The editor's preview call sends `formGroup.getRawValue()` verbatim
  // (subject/preheader/body/status) — status (and any other future form
  // field) is harmless here since preview never persists anything, so
  // unknown keys are allowed rather than requiring the frontend to strip
  // fields before every preview request.
  body: Joi.object({
    subject: Joi.string().allow(""),
    preheader: Joi.string().allow(""),
    body: Joi.string().allow(""),
  }).unknown(true),
});
