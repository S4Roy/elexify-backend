import { celebrate, Joi } from "celebrate";

export const changeStatus = celebrate({
  body: Joi.object({
    _id: Joi.string().hex().length(24).required().messages({
      "string.empty": "Customer ID is required",
      "string.length": "Invalid customer ID",
    }),
    status: Joi.string().valid("active", "inactive").required().messages({
      "string.empty": "Status is required",
      "any.only": "Status must be active or inactive",
    }),
  }),
});
