import { celebrate, Joi } from "celebrate";
import { validationHelper } from "../../../helpers/index.js";

export const requestPasswordReset = celebrate({
  body: Joi.object({
    email: Joi.string().email().required(), // Ensure valid email format
  }),
});
