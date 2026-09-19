import { celebrate, Joi } from 'celebrate';
const id = () => Joi.string().hex().length(24);
export const adminOrderSchema = Joi.object({
  customer_id: id().required(),
  address_id: id().required(),
  payment_method: Joi.string().valid('cod', 'razorpay').required(),
  items: Joi.array().items(Joi.object({
    product_id: id().required(), variation_id: id().allow(null),
    quantity: Joi.number().integer().min(1).max(10000).required(),
  })).min(1).max(100).required(),
  note: Joi.string().trim().max(500).allow('').default(''),
  idempotency_key: Joi.string().guid().required(),
  expected_total: Joi.number().min(0).precision(2).required(),
});
export const place = celebrate({ body: adminOrderSchema });
export const quote = celebrate({ body: adminOrderSchema.keys({ expected_total: Joi.forbidden() }) });
