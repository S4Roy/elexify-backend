import { celebrate, Joi } from "celebrate";

const ORDER_STATUSES = ["pending", "confirmed", "processing", "packed"];

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
    cod_enabled: Joi.boolean().optional(),
    cod_min_order: Joi.number().min(0).optional(),
    cod_max_order: Joi.number().min(0).optional().allow(null),
    cod_charge_enabled: Joi.boolean().optional(),
    cod_charge: Joi.number().min(0).optional(),
    cod_advance_enabled: Joi.boolean().optional(),
    cod_advance_percent: Joi.number().min(0).max(100).optional(),
    cod_allowed_pincodes: Joi.array().items(Joi.string().pattern(/^\d{6}$/)).optional(),
    cod_disallowed_pincodes: Joi.array().items(Joi.string().pattern(/^\d{6}$/)).optional(),
    cod_disallowed_categories: Joi.array().items(Joi.string().hex().length(24)).optional(),
    cod_disallowed_brands: Joi.array().items(Joi.string().hex().length(24)).optional(),
    cod_disallowed_shipping_classes: Joi.array().items(Joi.string().hex().length(24)).optional(),
    cod_disallowed_zones: Joi.array().items(Joi.string().hex().length(24)).optional(),
    cod_allowed_customer_types: Joi.array().items(Joi.string()).optional(),
    customer_cancellation_enabled: Joi.boolean().optional(),
    customer_cancellation_statuses: Joi.array().items(Joi.string().valid(...ORDER_STATUSES)).unique().optional(),
    customer_cancel_packed_before_dispatch: Joi.boolean().optional(),
    admin_cancellation_enabled: Joi.boolean().optional(),
    admin_cancellation_statuses: Joi.array().items(Joi.string().valid(...ORDER_STATUSES)).unique().optional(),
    returns_enabled: Joi.boolean().optional(),
    return_window_days: Joi.number().integer().min(0).max(365).optional(),
    return_auto_approve: Joi.boolean().optional(),
    return_require_images: Joi.boolean().optional(),
    return_reasons: Joi.array().items(Joi.string().trim().min(2).max(100)).min(1).max(20).unique().optional(),
  }),
});
