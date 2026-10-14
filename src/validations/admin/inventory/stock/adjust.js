import { celebrate, Joi } from "celebrate";
import { STOCK_ADJUSTMENT_REASONS } from "../../../../constants/stock.js";

const objectId = Joi.string().hex().length(24);

export const adjustmentRow = Joi.object({
  product: objectId.required(),
  variation: objectId.optional().allow(null, ""),
  // delta: signed change (+received / -written off). set: counted on-hand.
  mode: Joi.string().valid("delta", "set").default("delta"),
  quantity: Joi.number().integer().min(-100000).max(100000).required()
    .when("mode", { is: "set", then: Joi.number().min(0) }),
  reason: Joi.string().valid(...STOCK_ADJUSTMENT_REASONS).required(),
  note: Joi.string().trim().max(500).optional().allow(null, ""),
  // On-hand the admin saw when they started; a mismatch returns 409.
  expected_on_hand: Joi.number().integer().optional().allow(null),
});

export const adjust = celebrate({ body: adjustmentRow });

export const bulkAdjust = celebrate({
  body: Joi.object({
    rows: Joi.array().items(adjustmentRow).min(1).max(200).required(),
  }),
});
