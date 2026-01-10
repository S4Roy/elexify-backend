import { celebrate, Joi } from "celebrate";
import { validationHelper } from "../../../helpers/index.js";

export const adminLogin = celebrate({
  body: Joi.object({
    email: Joi.string().email().required(), // Ensure valid email format
    password: Joi.string().min(6).max(20).required(), // Password constraints
  }),
});
