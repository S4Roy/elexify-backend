import { celebrate, Joi, Segments } from "celebrate";

export const signup = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(30).required().label("Name"),
    // last_name: Joi.string().min(2).max(30).required().label("Last Name"),
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().min(6).max(128).required().label("Password"),
    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        "string.empty": "Phone number is required",
        "string.pattern.base": "Phone number must be a valid 10-digit number",
      }),
    confirm_password: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .label("Confirm Password")
      .messages({ "any.only": "{{#label}} does not match Password" }),
  }),
});
