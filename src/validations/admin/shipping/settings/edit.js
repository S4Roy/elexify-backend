import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    processing_days_min: Joi.number().integer().min(0).optional(),
    processing_days_max: Joi.number().integer().min(0).optional(),
    exclude_weekends: Joi.boolean().optional(),
    weekend_days: Joi.array().items(Joi.number().integer().min(0).max(6)).optional(),
    holidays: Joi.array().items(Joi.date()).optional(),
    order_cutoff_time: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .allow(null, "")
      .messages({ "string.pattern.base": "Cutoff time must be in HH:mm format" }),
    default_shipping_zone: Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .optional()
      .allow(null, ""),
  }),
});
