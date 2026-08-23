import { celebrate, Joi } from "celebrate";

const FILTER_VALUES = [
  "missing_title",
  "missing_description",
  "missing_keyword",
  "duplicate_title",
  "duplicate_description",
  "poor",
  "needs_improvement",
  "good",
];

export const bulkGenerate = celebrate({
  body: Joi.object({
    product_ids: Joi.array().items(Joi.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
    filter: Joi.string().valid(...FILTER_VALUES).optional().allow(null, ""),
    overwrite: Joi.boolean().optional(),
  }),
});
