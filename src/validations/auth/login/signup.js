import { celebrate, Joi, Segments } from "celebrate";

export const signup = celebrate({
  [Segments.BODY]: Joi.object({
    first_name: Joi.string().min(2).max(30).required().label("First Name"),
    last_name: Joi.string().min(2).max(30).required().label("Last Name"),
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().min(6).max(128).required().label("Password"),
    confirm_password: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .label("Confirm Password")
      .messages({ "any.only": "{{#label}} does not match Password" }),
  }),
});
