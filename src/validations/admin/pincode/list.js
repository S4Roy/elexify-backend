import { celebrate, Joi } from "celebrate";

export const list = celebrate({
  query: Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search_key: Joi.string().optional().allow("", null),
    sort_by: Joi.string()
      .optional()
      .allow("", null)
      .valid("pincode", "district", "status", "updated_at", "created_at"),
    sort_order: Joi.number().optional().allow(null).valid(-1, 1),
    status: Joi.string().optional().allow("", null),
    state_id: Joi.number().optional().allow(null),
  }),
});
