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

export const report = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search: Joi.string().optional().allow("", null),
    filter: Joi.string().valid(...FILTER_VALUES).optional().allow(null, ""),
  }),
});
