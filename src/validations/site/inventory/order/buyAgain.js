import { celebrate, Joi } from "celebrate";
const id = () => Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required();
export const buyAgainPreview = celebrate({ query: Joi.object({ order_id: id() }) });
export const buyAgainAdd = celebrate({ body: Joi.object({
  order_id: id(),
  items: Joi.array().items(Joi.object({ order_item_id: id(), quantity: Joi.number().integer().min(1).max(100000).required() }))
    .min(1).max(100).unique("order_item_id").required(),
}) });
