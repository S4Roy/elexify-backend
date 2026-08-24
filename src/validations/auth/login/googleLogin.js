import { celebrate, Joi, Segments } from "celebrate";

export const googleLogin = celebrate({
  [Segments.BODY]: Joi.object({
    id_token: Joi.string().required().messages({
      "string.empty": "Google credential is required",
    }),
  }),
});
