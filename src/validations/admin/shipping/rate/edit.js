import { celebrate, Joi } from "celebrate";

const objectId = () =>
  Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({ "string.pattern.base": "Invalid ID format" });

export const edit = celebrate({
  body: Joi.object({
    _id: objectId().required(),
    zone: objectId().optional(),
    shipping_class: objectId().optional().allow(null, ""),
    flat_rate: Joi.number().min(0).optional(),
    per_kg_rate: Joi.number().min(0).optional(),
    free_weight_kg: Joi.number().min(0).optional(),
    free_shipping_min_order_value: Joi.number().min(0).optional().allow(null),
    min_delivery_days: Joi.number().integer().min(0).optional(),
    max_delivery_days: Joi.number().integer().min(0).optional(),
    status: Joi.string().valid("active", "inactive").required(),
  }),
});
