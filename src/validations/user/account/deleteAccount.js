import { celebrate, Joi } from "celebrate";
import { DELETION_REASONS } from "../../../services/user/accountDeletion.js";

export const confirmAccountDeletion = celebrate({
  body: Joi.object({
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length": "OTP must be 6 digits",
      "string.pattern.base": "OTP must contain digits only",
      "string.empty": "OTP is required",
    }),
    reason: Joi.string()
      .valid(...DELETION_REASONS)
      .allow(null, "")
      .optional(),
  }),
});
