import { celebrate, Joi } from "celebrate";

export const edit = celebrate({
  body: Joi.object({
    site_name: Joi.string().allow("", null).optional(),
    product_title_template: Joi.string().allow("", null).optional(),
    product_description_template: Joi.string().allow("", null).optional(),
    title_min_length: Joi.number().integer().min(0).optional(),
    title_max_length: Joi.number().integer().min(0).optional(),
    description_min_length: Joi.number().integer().min(0).optional(),
    description_max_length: Joi.number().integer().min(0).optional(),
  }),
});
