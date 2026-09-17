import { celebrate, Joi } from "celebrate";

export const update = celebrate({
  body: Joi.object({
    category: Joi.string().max(50).allow(""),
    message: Joi.string().min(1).required(),
    variables: Joi.array().items(Joi.string().min(1)).required(),
    dlt_message_id: Joi.string().min(1).max(50).required(),
    sender_id: Joi.string().allow("", null).max(20),
    is_unicode: Joi.boolean(),
    status: Joi.string().valid("active", "inactive"),
  }),
});

export const resetToDefault = celebrate({
  body: Joi.object({
    confirm: Joi.boolean().valid(true).required(),
  }),
});

export const seedRun = celebrate({
  body: Joi.object({
    type: Joi.string().valid("seed").required(),
  }),
});
