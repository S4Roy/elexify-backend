import { celebrate, Joi } from "celebrate";

const objectId = () =>
  Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({ "string.pattern.base": "Invalid ID format" });

export const add = celebrate({
  body: Joi.object({
    zone: objectId().required(),
    shipping_class: objectId().optional().allow(null, ""),
    flat_rate: Joi.number().min(0).required(),
    per_kg_rate: Joi.number().min(0).optional().default(0),
    free_weight_kg: Joi.number().min(0).optional().default(0),
    free_shipping_min_order_value: Joi.number().min(0).optional().allow(null),
    min_delivery_days: Joi.number().integer().min(0).required(),
    max_delivery_days: Joi.number().integer().min(Joi.ref("min_delivery_days")).required(),
    status: Joi.string().valid("active", "inactive").default("active"),
  }),
});
